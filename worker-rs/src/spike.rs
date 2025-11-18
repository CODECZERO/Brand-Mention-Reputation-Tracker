use std::sync::Arc;
use anyhow::Result;
use tracing::info;

use crate::config::Settings;
use crate::metrics::WORKER_SPIKE_DETECTION_SECONDS;
use crate::redis_client::RedisClient;

#[derive(Debug, Default, Clone)]
pub struct SpikeDetectionResult {
    pub is_spike: bool,
    pub historical_average: f64,
    pub current_count: usize,
}

pub struct SpikeDetector {
    redis: RedisClient,
    settings: Arc<Settings>,
}

impl SpikeDetector {
    pub fn new(redis: RedisClient, settings: Arc<Settings>) -> Self {
        Self { redis, settings }
    }

    pub async fn detect(&self, brand: &str, cluster_id: i32, current_count: usize) -> Result<SpikeDetectionResult> {
        let start = std::time::Instant::now();
        let history = self
            .redis
            .get_spike_history(&self.settings.redis_spike_prefix, brand, cluster_id)
            .await?;

        let historical_average = if history.is_empty() {
            0.0
        } else {
            history.iter().copied().map(|value| value as f64).sum::<f64>() / history.len() as f64
        };

        let threshold = self.settings.max_retries as f64; // placeholder threshold to be tuned later
        let is_spike = current_count as f64 > threshold.max(historical_average * 2.0);

        self
            .redis
            .append_spike_history(
                &self.settings.redis_spike_prefix,
                brand,
                cluster_id,
                current_count as i64,
                self.settings.spike_history_ttl,
            )
            .await?;

        let duration = start.elapsed().as_secs_f64();
        WORKER_SPIKE_DETECTION_SECONDS
            .with_label_values(&[&self.settings.worker_id, brand])
            .observe(duration);

        info!(
            worker_id = %self.settings.worker_id,
            brand,
            cluster_id,
            current_count,
            historical_average,
            is_spike,
            "Spike detection evaluated"
        );

        Ok(SpikeDetectionResult {
            is_spike,
            historical_average,
            current_count,
        })
    }
}
