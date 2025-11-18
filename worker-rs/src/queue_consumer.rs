use std::time::Duration;

use tokio::time;
use tracing::info;

use crate::redis_client::RedisClient;

pub struct QueueConsumer {
    redis: RedisClient,
    worker_id: String,
    blpop_timeout: Duration,
}

impl QueueConsumer {
    pub fn new(redis: RedisClient, worker_id: String, blpop_timeout: Duration) -> Self {
        Self {
            redis,
            worker_id,
            blpop_timeout,
        }
    }

    pub async fn fetch(&self, keys: &[String]) -> anyhow::Result<Option<(String, String, f64)>> {
        let start = std::time::Instant::now();
        if keys.is_empty() {
            time::sleep(self.blpop_timeout).await;
            return Ok(None);
        }

        let result = self.redis.blpop(keys, self.blpop_timeout).await?;
        let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;

        if let Some((queue_key, payload)) = result {
            info!(worker_id = %self.worker_id, queue = %queue_key, fetch_time_ms = elapsed_ms, "Fetched chunk from Redis");
            Ok(Some((queue_key, payload, elapsed_ms)))
        } else {
            Ok(None)
        }
    }

    pub async fn scan_brand_queues(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        self.redis.scan_brand_queues(prefix).await
    }

    pub async fn set_heartbeat(&self, worker_id: &str, interval: Duration) -> anyhow::Result<()> {
        self.redis.set_heartbeat(worker_id, interval).await
    }
}
