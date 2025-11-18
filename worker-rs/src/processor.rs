use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::warn;

use crate::clustering::{Clusterer, ClusteringOutput};
use crate::config::Settings;
use crate::embeddings::InstrumentedEmbeddingAdapter;
use crate::llm::InstrumentedLlmAdapter;
use crate::metrics::{
    WORKER_PREPROCESSING_TIME_SECONDS,
};
use crate::spike::{SpikeDetectionResult, SpikeDetector};
use crate::types::{Chunk, ChunkMetrics, ChunkResult, ClusterResult, Mention};

static URL_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"https?://\S+").expect("Invalid URL regex"));
static WHITESPACE_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\s+").expect("Invalid whitespace regex"));
const TOPIC_LIMIT: usize = 10;

pub struct Processor {
    settings: Arc<Settings>,
    embeddings: InstrumentedEmbeddingAdapter,
    clusterer: Clusterer,
    llm: InstrumentedLlmAdapter,
    spike_detector: SpikeDetector,
}

impl Processor {
    pub fn new(
        settings: Arc<Settings>,
        embeddings: InstrumentedEmbeddingAdapter,
        clusterer: Clusterer,
        llm: InstrumentedLlmAdapter,
        spike_detector: SpikeDetector,
    ) -> Self {
        Self {
            settings,
            embeddings,
            clusterer,
            llm,
            spike_detector,
        }
    }

    pub async fn process_chunk(&self, chunk: Chunk, fallback_brand: &str, fetch_time_ms: f64) -> Result<ChunkResult> {
        let total_start = Instant::now();
        let mut metrics = ChunkMetrics {
            io_time_ms: fetch_time_ms,
            ..Default::default()
        };

        let mut brand = chunk.brand.clone();
        if brand.trim().is_empty() {
            brand = fallback_brand.to_string();
        }

        let preprocess_start = Instant::now();
        let mentions = self.preprocess(&chunk.mentions);
        let preprocessing_duration = preprocess_start.elapsed();
        metrics.preprocessing_time_ms = preprocessing_duration.as_secs_f64() * 1000.0;
        WORKER_PREPROCESSING_TIME_SECONDS
            .with_label_values(&[&self.settings.worker_id, &brand])
            .observe(preprocessing_duration.as_secs_f64());

        if mentions.is_empty() {
            metrics.total_task_time_ms = total_start.elapsed().as_secs_f64() * 1000.0 + metrics.io_time_ms;
            return Ok(ChunkResult {
                chunk_id: chunk.chunk_id,
                brand,
                timestamp: chunk.created_at.timestamp(),
                clusters: Vec::new(),
                metrics,
            });
        }

        let embed_start = Instant::now();
        let embeddings = self
            .embeddings
            .embed(&mentions, &brand, &chunk.chunk_id)
            .await;
        metrics.embedding_time_ms = embed_start.elapsed().as_secs_f64() * 1000.0;

        let clustering_output = self
            .clusterer
            .cluster(&embeddings, &brand, &chunk.chunk_id)
            .await;
        metrics.clustering_time_ms = clustering_output.duration_ms;

        let clusters = self
            .build_cluster_results(&brand, &chunk.chunk_id, &mentions, clustering_output)
            .await;

        metrics.llm_time_ms = clusters.iter().map(|cluster| cluster.metrics.llm_ms).sum();
        metrics.spike_detection_time_ms = clusters
            .iter()
            .map(|cluster| cluster.metrics.spike_ms)
            .sum();

        let cluster_results: Vec<ClusterResult> = clusters.into_iter().map(|wrapper| wrapper.cluster).collect();

        metrics.total_task_time_ms = total_start.elapsed().as_secs_f64() * 1000.0 + metrics.io_time_ms;

        Ok(ChunkResult {
            chunk_id: chunk.chunk_id,
            brand,
            timestamp: chunk.created_at.timestamp(),
            clusters: cluster_results,
            metrics,
        })
    }

    fn preprocess(&self, mentions: &[Mention]) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut cleaned = Vec::new();

        for mention in mentions {
            let candidate = self.clean_text(&mention.text);
            if candidate.is_empty() {
                continue;
            }
            if seen.insert(candidate.clone()) {
                cleaned.push(candidate);
            }
        }

        cleaned
    }

    fn clean_text(&self, text: &str) -> String {
        let without_urls = URL_RE.replace_all(text, "");
        let normalized = WHITESPACE_RE.replace_all(without_urls.trim(), " ");
        normalized.to_lowercase()
    }

    async fn build_cluster_results(
        &self,
        brand: &str,
        chunk_id: &str,
        mentions: &[String],
        clustering_output: ClusteringOutput,
    ) -> Vec<ClusterWithMetrics> {
        let mut results = Vec::new();

        for group in clustering_output.clusters {
            let cluster_mentions: Vec<String> = group
                .indices
                .iter()
                .filter_map(|&idx| mentions.get(idx).cloned())
                .collect();

            if cluster_mentions.is_empty() {
                continue;
            }

            let examples = cluster_mentions
                .iter()
                .take(self.settings.preprocessing_examples)
                .cloned()
                .collect::<Vec<_>>();

            let llm_start = Instant::now();
            let summary = self.llm.summarize(brand, &cluster_mentions).await;
            let sentiment = self.llm.sentiment(brand, &cluster_mentions).await;
            let llm_duration_ms = llm_start.elapsed().as_secs_f64() * 1000.0;

            let spike_start = Instant::now();
            let spike_result = match self
                .spike_detector
                .detect(brand, group.cluster_id, cluster_mentions.len())
                .await
            {
                Ok(result) => result,
                Err(err) => {
                    warn!(
                        worker_id = %self.settings.worker_id,
                        brand,
                        chunk_id,
                        cluster_id = group.cluster_id,
                        error = %err,
                        "Spike detection failed; marking cluster as non-spike"
                    );
                    SpikeDetectionResult::default()
                }
            };
            let spike_duration_ms = spike_start.elapsed().as_secs_f64() * 1000.0;

            let topics = cluster_mentions
                .iter()
                .take(TOPIC_LIMIT)
                .cloned()
                .collect::<Vec<_>>();

            results.push(ClusterWithMetrics {
                cluster: ClusterResult {
                    cluster_id: group.cluster_id,
                    count: cluster_mentions.len(),
                    examples: examples.clone(),
                    summary,
                    spike: spike_result.is_spike,
                    sentiment,
                    topics: Some(topics),
                },
                metrics: ClusterStageMetrics {
                    llm_ms: llm_duration_ms,
                    spike_ms: spike_duration_ms,
                },
            });
        }

        if results.is_empty() {
            // Fallback: treat all mentions as a single cluster.
            let examples = mentions
                .iter()
                .take(self.settings.preprocessing_examples)
                .cloned()
                .collect::<Vec<_>>();
            results.push(ClusterWithMetrics {
                cluster: ClusterResult {
                    cluster_id: 1,
                    count: mentions.len(),
                    examples: examples.clone(),
                    summary: examples.first().cloned(),
                    spike: false,
                    sentiment: HashMap::from([
                        ("positive".to_string(), 0.33),
                        ("negative".to_string(), 0.33),
                        ("neutral".to_string(), 0.34),
                    ]),
                    topics: Some(examples),
                },
                metrics: ClusterStageMetrics::default(),
            });
        }

        results
    }
}

#[derive(Default)]
struct ClusterStageMetrics {
    llm_ms: f64,
    spike_ms: f64,
}

struct ClusterWithMetrics {
    cluster: ClusterResult,
    metrics: ClusterStageMetrics,
}
