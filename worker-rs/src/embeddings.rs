use std::sync::Arc;
use std::time::Instant;

use async_trait::async_trait;
use sha2::{Digest, Sha256};
use tracing::warn;

use crate::config::Settings;
use crate::metrics::WORKER_EMBEDDING_TIME_SECONDS;

const FALLBACK_DIM: usize = 128;

#[async_trait]
pub trait EmbeddingAdapter: Send + Sync {
    async fn embed(&self, texts: &[String], brand: &str, chunk_id: &str) -> Vec<Vec<f32>>;
}

pub struct HashEmbeddingAdapter;

#[async_trait]
impl EmbeddingAdapter for HashEmbeddingAdapter {
    async fn embed(&self, texts: &[String], _brand: &str, _chunk_id: &str) -> Vec<Vec<f32>> {
        texts.iter().map(|text| hash_vector(text)).collect()
    }
}

fn hash_vector(text: &str) -> Vec<f32> {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let digest = hasher.finalize();
    let mut result = vec![0.0_f32; FALLBACK_DIM];
    for (idx, chunk) in digest.iter().cycle().take(FALLBACK_DIM).enumerate() {
        result[idx] = (*chunk as f32) / 255.0;
    }
    result
}

pub struct RemoteEmbeddingAdapter {
    provider: String,
}

#[async_trait]
impl EmbeddingAdapter for RemoteEmbeddingAdapter {
    async fn embed(&self, texts: &[String], brand: &str, chunk_id: &str) -> Vec<Vec<f32>> {
        warn!(provider = %self.provider, count = texts.len(), brand, chunk_id, "Remote embedding provider not yet implemented; returning hashed vectors");
        texts.iter().map(|text| hash_vector(text)).collect()
    }
}

pub struct InstrumentedEmbeddingAdapter {
    delegate: Arc<dyn EmbeddingAdapter>,
    worker_id: String,
}

impl InstrumentedEmbeddingAdapter {
    pub fn new(delegate: Arc<dyn EmbeddingAdapter>, worker_id: String) -> Self {
        Self { delegate, worker_id }
    }

    pub async fn embed(&self, texts: &[String], brand: &str, chunk_id: &str) -> Vec<Vec<f32>> {
        let start = Instant::now();
        let vectors = self.delegate.embed(texts, brand, chunk_id).await;
        let duration = start.elapsed();
        WORKER_EMBEDDING_TIME_SECONDS
            .with_label_values(&[&self.worker_id, brand])
            .observe(duration.as_secs_f64());
        vectors
    }
}

pub fn build_embedding_adapter(settings: &Arc<Settings>) -> InstrumentedEmbeddingAdapter {
    let provider = settings.embeddings_provider.as_str();
    let delegate: Arc<dyn EmbeddingAdapter> = match provider {
        "local" => Arc::new(HashEmbeddingAdapter),
        other => Arc::new(RemoteEmbeddingAdapter {
            provider: other.to_string(),
        }),
    };

    InstrumentedEmbeddingAdapter::new(delegate, settings.worker_id.clone())
}
