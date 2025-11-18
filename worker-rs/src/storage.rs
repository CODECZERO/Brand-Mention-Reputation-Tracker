use std::sync::Arc;
use std::time::Instant;

use anyhow::Context;
use chrono::Utc;
use serde_json::json;
use tracing::info;

use crate::config::Settings;
use crate::metrics::{
    WORKER_CHUNKS_FAILED_TOTAL, WORKER_CHUNKS_PROCESSED_TOTAL, WORKER_IO_TIME_SECONDS,
};
use crate::redis_client::RedisClient;
use crate::types::{ChunkResult, FailureRecord};

pub struct ResultStorage {
    redis: RedisClient,
    settings: Arc<Settings>,
}

impl ResultStorage {
    pub fn new(redis: RedisClient, settings: Arc<Settings>) -> Self {
        Self { redis, settings }
    }

    pub async fn push_result(&self, brand: &str, result: &mut ChunkResult) -> anyhow::Result<f64> {
        let key = format!("{}:{}:chunks", self.settings.redis_result_prefix, brand);
        let payload = self.format_for_orchestrator(result);
        let payload_str = serde_json::to_string(&payload).context("serialise chunk result")?;

        let start = Instant::now();
        self.redis.rpush(&key, &payload_str).await?;
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

        result.metrics.io_time_ms += elapsed_ms;

        WORKER_IO_TIME_SECONDS
            .with_label_values(&[&self.settings.worker_id, brand, "push"])
            .observe(elapsed_ms / 1000.0);
        WORKER_CHUNKS_PROCESSED_TOTAL
            .with_label_values(&[&self.settings.worker_id, brand])
            .inc();

        info!(
            worker_id = %self.settings.worker_id,
            brand, key, chunk_id = %result.chunk_id,
            push_time_ms = elapsed_ms,
            "Result pushed to Redis"
        );

        Ok(elapsed_ms)
    }

    pub async fn record_failure(
        &self,
        brand: &str,
        failure: &FailureRecord,
        reason_label: &str,
    ) -> anyhow::Result<f64> {
        let key = format!("{}:{}", self.settings.redis_failed_prefix, brand);
        let payload = serde_json::to_string(failure).context("serialise failure record")?;

        let start = Instant::now();
        self.redis.record_failure(&key, &payload).await?;
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

        WORKER_CHUNKS_FAILED_TOTAL
            .with_label_values(&[&self.settings.worker_id, brand, reason_label])
            .inc();
        WORKER_IO_TIME_SECONDS
            .with_label_values(&[&self.settings.worker_id, brand, "failure"])
            .observe(elapsed_ms / 1000.0);

        info!(
            worker_id = %self.settings.worker_id,
            brand,
            chunk_id = %failure.chunk_id,
            reason = %failure.reason,
            failure_record_time_ms = elapsed_ms,
            "Failure recorded",
        );

        Ok(elapsed_ms)
    }

    fn format_for_orchestrator(&self, result: &ChunkResult) -> serde_json::Value {
        let sentiment = self.aggregate_sentiment(&result.clusters);
        let topics = self.extract_topics(&result.clusters);
        let spike_detected = result.clusters.iter().any(|cluster| cluster.spike);
        let mention_count: usize = result.clusters.iter().map(|cluster| cluster.count).sum();

        json!({
            "chunkId": result.chunk_id,
            "brand": result.brand,
            "processedAt": Utc::now().to_rfc3339(),
            "sentiment": sentiment,
            "clusters": self.build_clusters(&result.clusters),
            "topics": topics,
            "summary": self.combine_summaries(&result.clusters),
            "spikeDetected": spike_detected,
            "meta": {
                "metrics": result.metrics,
                "mentionCount": mention_count,
            }
        })
    }

    fn build_clusters(&self, clusters: &[crate::types::ClusterResult]) -> Vec<serde_json::Value> {
        clusters
            .iter()
            .map(|cluster| {
                let sentiment_score = cluster
                    .sentiment
                    .get("positive")
                    .copied()
                    .unwrap_or_default()
                    - cluster.sentiment.get("negative").copied().unwrap_or_default();
                let label = self.normalise_summary_text(
                    cluster.summary.as_deref(),
                    &cluster.examples,
                    Some(format!("Cluster {}", cluster.cluster_id)),
                );
                json!({
                    "id": cluster.cluster_id.to_string(),
                    "label": label,
                    "mentions": cluster.examples,
                    "sentimentScore": sentiment_score,
                    "spike": cluster.spike,
                    "mentionCount": cluster.count,
                })
            })
            .collect()
    }

    fn aggregate_sentiment(
        &self,
        clusters: &[crate::types::ClusterResult],
    ) -> serde_json::Value {
        let mut totals = [0.0f32, 0.0, 0.0]; // positive, neutral, negative
        let mut counted = 0.0f32;
        for cluster in clusters {
            if !cluster.sentiment.is_empty() {
                totals[0] += cluster.sentiment.get("positive").copied().unwrap_or_default();
                totals[1] += cluster.sentiment.get("neutral").copied().unwrap_or_default();
                totals[2] += cluster.sentiment.get("negative").copied().unwrap_or_default();
                counted += 1.0;
            }
        }
        if counted > 0.0 {
            totals.iter_mut().for_each(|value| *value /= counted);
        }
        let score = totals[0] - totals[2];
        json!({
            "positive": totals[0],
            "neutral": totals[1],
            "negative": totals[2],
            "score": score,
        })
    }

    fn extract_topics(&self, clusters: &[crate::types::ClusterResult]) -> Vec<String> {
        let mut topics: Vec<String> = Vec::new();
        for cluster in clusters {
            if let Some(normalised) = self
                .normalise_summary_text(cluster.summary.as_deref(), &cluster.examples, None)
                .filter(|value| !value.is_empty())
            {
                topics.push(normalised);
            } else if let Some(example) = cluster.examples.get(0) {
                topics.push(example.clone());
            }
        }
        topics.truncate(10);
        topics
    }

    fn combine_summaries(&self, clusters: &[crate::types::ClusterResult]) -> String {
        clusters
            .iter()
            .filter_map(|cluster| {
                self.normalise_summary_text(cluster.summary.as_deref(), &cluster.examples, None)
            })
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }

    fn normalise_summary_text(
        &self,
        summary: Option<&str>,
        examples: &[String],
        fallback_label: Option<String>,
    ) -> Option<String> {
        let mut candidate = summary.unwrap_or_default().trim().to_string();
        if candidate.starts_with('{') && candidate.ends_with('}') && candidate.contains("positive") {
            candidate.clear();
        }
        if candidate.is_empty() {
            if let Some(example) = examples.get(0) {
                candidate = example.trim().to_string();
            }
        }
        if candidate.is_empty() {
            if let Some(fallback) = fallback_label {
                candidate = fallback;
            }
        }
        Some(candidate)
    }
}
