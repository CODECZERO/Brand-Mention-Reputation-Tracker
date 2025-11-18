use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use tokio::sync::{broadcast, Mutex};
use tokio::time::sleep;
use tracing::{info, warn};

use crate::clustering::Clusterer;
use crate::config::Settings;
use crate::embeddings::build_embedding_adapter;
use crate::llm::build_llm_adapter;
use crate::metrics::{
    WORKER_IO_TIME_SECONDS, WORKER_PROCESSING_TIME_SECONDS, WORKER_WAITING_SECONDS,
};
use crate::processor::Processor;
use crate::queue_consumer::QueueConsumer;
use crate::redis_client::RedisClient;
use crate::spike::SpikeDetector;
use crate::storage::ResultStorage;
use crate::types::{Chunk, FailureRecord};

pub struct WorkerService {
    settings: Arc<Settings>,
    redis: RedisClient,
    queue_consumer: QueueConsumer,
    processor: Processor,
    storage: ResultStorage,
    waiting_since: Mutex<Option<Instant>>,
    last_wait_log: Mutex<Option<Instant>>,
}

impl WorkerService {
    pub fn new(settings: Arc<Settings>, redis: RedisClient, queue_consumer: QueueConsumer) -> Self {
        let embeddings = build_embedding_adapter(&settings);
        let clusterer = Clusterer::new(settings.worker_id.clone());
        let llm = build_llm_adapter(&settings);
        let spike_detector = SpikeDetector::new(redis.clone(), settings.clone());
        let processor = Processor::new(settings.clone(), embeddings, clusterer, llm, spike_detector);
        let storage = ResultStorage::new(redis.clone(), settings.clone());
        Self {
            settings,
            redis,
            queue_consumer,
            processor,
            storage,
            waiting_since: Mutex::new(None),
            last_wait_log: Mutex::new(None),
        }
    }

    pub fn settings(&self) -> &Arc<Settings> {
        &self.settings
    }

    pub async fn process_next(&self) -> Result<()> {
        let queue_keys = self
            .queue_consumer
            .scan_brand_queues(&self.settings.redis_queue_prefix)
            .await
            .context("scan brand queues")?;

        if queue_keys.is_empty() {
            self.update_waiting(None).await;
            sleep(self.settings.blpop_timeout).await;
            return Ok(());
        }

        match self
            .queue_consumer
            .fetch(&queue_keys)
            .await
            .context("fetch queue entry")?
        {
            Some((queue_key, payload, fetch_time_ms)) => {
                self.clear_waiting().await;
                let brand_hint = extract_brand_from_queue(&queue_key, &self.settings.redis_queue_prefix);
                WORKER_IO_TIME_SECONDS
                    .with_label_values(&[&self.settings.worker_id, &brand_hint, "fetch"])
                    .observe(fetch_time_ms / 1000.0);

                if let Err(err) = self.handle_payload(&brand_hint, payload, fetch_time_ms).await {
                        warn!(error = %err, "Failed to handle payload");
                }
            }
            None => {
                self.update_waiting(Some(&queue_keys)).await;
            }
        }

        Ok(())
    }

    pub async fn send_heartbeat(&self) -> Result<()> {
        self.redis
            .set_heartbeat(&self.settings.worker_id, self.settings.heartbeat_interval)
            .await
            .context("set heartbeat")
    }

    async fn handle_payload(&self, brand_hint: &str, payload: String, fetch_time_ms: f64) -> Result<f64> {
        let chunk: Chunk = match serde_json::from_str(&payload) {
            Ok(chunk) => chunk,
            Err(error) => {
                self.record_failure(
                    brand_hint,
                    FailureReason::JsonDecode,
                    &payload,
                    &error.to_string(),
                    "unknown",
                )
                .await?;
                return Err(error.into());
            }
        };

        let fallback_brand = brand_hint.clone();
        let expected_brand = if chunk.brand.trim().is_empty() {
            fallback_brand.clone()
        } else {
            chunk.brand.clone()
        };

        let chunk_id = chunk.chunk_id.clone();

        let mut result = match self
            .processor
            .process_chunk(chunk, &fallback_brand, fetch_time_ms)
            .await
        {
            Ok(result) => result,
            Err(err) => {
                self.record_failure(&expected_brand, FailureReason::Processing, &payload, &err.to_string(), &chunk_id)
                    .await?;
                return Err(err);
            }
        };

        let final_brand = result.brand.clone();

        match self.storage.push_result(&final_brand, &mut result).await {
            Ok(push_time_ms) => {
                result.metrics.total_task_time_ms += push_time_ms;
            }
            Err(err) => {
                self.record_failure(&final_brand, FailureReason::Processing, &payload, &err.to_string(), &chunk_id)
                    .await?;
                return Err(err);
            }
        }

        info!(
            worker_id = %self.settings.worker_id,
            brand = %final_brand,
            chunk_id = %result.chunk_id,
            "Chunk processed"
        );

        WORKER_PROCESSING_TIME_SECONDS
            .with_label_values(&[&self.settings.worker_id, &final_brand])
            .observe(result.metrics.total_task_time_ms / 1000.0);

        Ok(result.metrics.total_task_time_ms)
    }

    async fn record_failure(
        &self,
        brand: &str,
        reason: FailureReason,
        payload: &str,
        error: &str,
        chunk_id: &str,
    ) -> Result<()> {
        let failure = FailureRecord {
            worker_id: self.settings.worker_id.clone(),
            brand: brand.to_string(),
            chunk_id: chunk_id.to_string(),
            reason: reason.message().to_string(),
            payload: payload.to_string(),
        };

        self.storage
            .record_failure(brand, &failure, reason.label())
            .await
            .context("record failure")
    }

    async fn update_waiting(&self, queues: Option<&[String]>) {
        let mut waiting = self.waiting_since.lock().await;
        let now = Instant::now();
        if waiting.is_none() {
            *waiting = Some(now);
        }
        let elapsed = waiting.map(|start| now.saturating_duration_since(start)).unwrap_or_default();
        WORKER_WAITING_SECONDS
            .with_label_values(&[&self.settings.worker_id])
            .set(elapsed.as_secs_f64());

        let mut last_log = self.last_wait_log.lock().await;
        let should_log = match *last_log {
            Some(last) => now.duration_since(last) >= self.settings.metrics_wait_log_interval,
            None => true,
        };
        if should_log {
            let queue_names = queues
                .map(|items| items.join(", "))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "<none>".to_string());
            info!(
                worker_id = %self.settings.worker_id,
                queues = %queue_names,
                waiting_seconds = elapsed.as_secs_f64(),
                "Waiting for new tasks"
            );
            *last_log = Some(now);
        }
    }

    async fn clear_waiting(&self) {
        let mut waiting = self.waiting_since.lock().await;
        *waiting = None;
        WORKER_WAITING_SECONDS
            .with_label_values(&[&self.settings.worker_id])
            .set(0.0);
    }

    pub async fn run(self: Arc<Self>, mut shutdown: broadcast::Receiver<()>) -> Result<()> {
        loop {
            tokio::select! {
                _ = shutdown.recv() => {
                    info!("Worker loop stopping");
                    break;
                }
                result = self.process_next() => {
                    if let Err(err) = result {
                        warn!(error = %err, "Worker iteration failed");
                    }
                }
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Copy)]
enum FailureReason {
    JsonDecode,
    Processing,
}

impl FailureReason {
    fn label(self) -> &'static str {
        match self {
            Self::JsonDecode => "json_decode",
            Self::Processing => "processing",
        }
    }

    fn message(self) -> &'static str {
        match self {
            Self::JsonDecode => "Invalid JSON",
            Self::Processing => "Processing failed",
        }
    }
}

fn extract_brand_from_queue(queue_key: &str, prefix: &str) -> String {
    if let Some(stripped) = queue_key.strip_prefix(&format!("{prefix}:")) {
        stripped
            .split(':')
            .next()
            .unwrap_or("unknown")
            .to_string()
    } else {
        queue_key
            .split(':')
            .nth(2)
            .unwrap_or("unknown")
            .to_string()
    }
}
