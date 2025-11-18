use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use tracing::{info, warn};

use crate::config::Settings;
use crate::metrics::WORKER_LLM_LATENCY_SECONDS;

#[async_trait]
pub trait LlmAdapter: Send + Sync {
    async fn summarize(&self, texts: &[String]) -> Option<String>;
    async fn sentiment(&self, texts: &[String]) -> HashMap<String, f32>;
}

pub struct MockLlmAdapter;

#[async_trait]
impl LlmAdapter for MockLlmAdapter {
    async fn summarize(&self, texts: &[String]) -> Option<String> {
        texts.first().cloned()
    }

    async fn sentiment(&self, texts: &[String]) -> HashMap<String, f32> {
        simple_sentiment(texts)
    }
}

pub struct RemoteLlmAdapter {
    provider: String,
}

#[async_trait]
impl LlmAdapter for RemoteLlmAdapter {
    async fn summarize(&self, texts: &[String]) -> Option<String> {
        warn!(provider = %self.provider, "Remote LLM summarize not implemented; using heuristic fallback");
        texts.first().cloned()
    }

    async fn sentiment(&self, texts: &[String]) -> HashMap<String, f32> {
        warn!(provider = %self.provider, "Remote LLM sentiment not implemented; using heuristic fallback");
        simple_sentiment(texts)
    }
}

pub struct InstrumentedLlmAdapter {
    delegate: Arc<dyn LlmAdapter>,
    worker_id: String,
}

impl InstrumentedLlmAdapter {
    pub fn new(delegate: Arc<dyn LlmAdapter>, worker_id: String) -> Self {
        Self { delegate, worker_id }
    }

    pub async fn summarize(&self, brand: &str, texts: &[String]) -> Option<String> {
        self.observe(brand, "summary", || self.delegate.summarize(texts)).await
    }

    pub async fn sentiment(&self, brand: &str, texts: &[String]) -> HashMap<String, f32> {
        self.observe(brand, "sentiment", || self.delegate.sentiment(texts)).await
    }

    async fn observe<T, Fut>(&self, brand: &str, operation: &str, fut: impl FnOnce() -> Fut) -> T
    where
        Fut: std::future::Future<Output = T>,
    {
        let start = Instant::now();
        let result = fut().await;
        let duration = start.elapsed();
        WORKER_LLM_LATENCY_SECONDS
            .with_label_values(&[&self.worker_id, brand, operation])
            .observe(duration.as_secs_f64());
        info!(worker_id = %self.worker_id, brand, operation, latency_ms = duration.as_secs_f64() * 1000.0, "LLM operation completed");
        result
    }
}

pub fn build_llm_adapter(settings: &Arc<Settings>) -> InstrumentedLlmAdapter {
    let delegate: Arc<dyn LlmAdapter> = match settings.llm_provider.as_str() {
        "mock" => Arc::new(MockLlmAdapter),
        other => Arc::new(RemoteLlmAdapter {
            provider: other.to_string(),
        }),
    };

    InstrumentedLlmAdapter::new(delegate, settings.worker_id.clone())
}

fn simple_sentiment(texts: &[String]) -> HashMap<String, f32> {
    let positive_words = ["great", "good", "love", "awesome", "excellent", "improved", "success", "fast"];
    let negative_words = ["bad", "hate", "poor", "slow", "issue", "problem", "bug", "error"];

    let mut positive = 0f32;
    let mut negative = 0f32;
    let mut neutral = 0f32;

    for text in texts {
        let lower = text.to_lowercase();
        let pos_hits = positive_words.iter().filter(|word| lower.contains(*word)).count();
        let neg_hits = negative_words.iter().filter(|word| lower.contains(*word)).count();
        match pos_hits.cmp(&neg_hits) {
            std::cmp::Ordering::Greater => positive += 1.0,
            std::cmp::Ordering::Less => negative += 1.0,
            std::cmp::Ordering::Equal => neutral += 1.0,
        }
    }

    if positive + negative + neutral == 0.0 {
        neutral = 1.0;
    }
    let total = positive + negative + neutral;
    HashMap::from([
        ("positive".to_string(), positive / total),
        ("negative".to_string(), negative / total),
        ("neutral".to_string(), neutral / total),
    ])
}
