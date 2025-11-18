use std::time::Duration;

use anyhow::Context;
use redis::{aio::ConnectionManager, AsyncCommands, Client, RedisResult};
use tokio::sync::Mutex;
use tokio::time::sleep;

#[derive(Clone)]
pub struct RedisClient {
    inner: std::sync::Arc<Mutex<ConnectionManager>>,
}

impl RedisClient {
    pub async fn new(url: &str) -> anyhow::Result<Self> {
        let client = Client::open(url.to_string()).context("Failed to create Redis client")?;
        let manager = client
            .get_tokio_connection_manager()
            .await
            .context("Failed to create Redis connection manager")?;
        Ok(Self {
            inner: std::sync::Arc::new(Mutex::new(manager)),
        })
    }

    pub async fn ensure_connection(&self) -> anyhow::Result<()> {
        let mut conn = self.inner.lock().await;
        redis::cmd("PING")
            .query_async::<_, ()>(&mut *conn)
            .await
            .context("Redis PING failed")
    }

    pub async fn blpop(&self, keys: &[String], timeout: Duration) -> anyhow::Result<Option<(String, String)>> {
        if keys.is_empty() {
            sleep(timeout).await;
            return Ok(None);
        }

        let mut conn = self.inner.lock().await;
        let timeout_secs = timeout.as_secs() as usize;
        let result: Option<(String, String)> = redis::cmd("BLPOP")
            .arg(keys)
            .arg(timeout_secs)
            .query_async(&mut *conn)
            .await
            .context("Redis BLPOP failed")?;
        Ok(result)
    }

    pub async fn rpush(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let mut conn = self.inner.lock().await;
        redis::cmd("RPUSH")
            .arg(key)
            .arg(value)
            .query_async::<_, ()>(&mut *conn)
            .await
            .context("Redis RPUSH failed")
    }

    pub async fn record_failure(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.rpush(key, value).await
    }

    pub async fn scan_brand_queues(&self, prefix: &str) -> anyhow::Result<Vec<String>> {
        let pattern = format!("{prefix}:*:chunks");
        let mut cursor: u64 = 0;
        let mut results: Vec<String> = Vec::new();
        loop {
            let mut conn = self.inner.lock().await;
            let (next, chunk): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg(&pattern)
                .arg("COUNT")
                .arg(100)
                .query_async(&mut *conn)
                .await
                .context("Redis SCAN failed")?;
            drop(conn);
            results.extend(chunk);
            if next == 0 {
                break;
            }
            cursor = next;
        }
        results.sort();
        results.dedup();
        Ok(results)
    }

    pub async fn set_heartbeat(&self, worker_id: &str, interval: Duration) -> anyhow::Result<()> {
        let key = format!("workers:heartbeat:{worker_id}");
        let ttl = (interval.as_secs().saturating_mul(2).max(interval.as_secs() + 5)) as usize;
        let mut conn = self.inner.lock().await;
        redis::cmd("SET")
            .arg(&key)
            .arg("alive")
            .arg("EX")
            .arg(ttl)
            .query_async::<_, ()>(&mut *conn)
            .await
            .context("Redis heartbeat SET failed")
    }

    pub async fn get_spike_history(&self, prefix: &str, brand: &str, cluster_id: i32) -> anyhow::Result<Vec<i64>> {
        let key = format!("{prefix}:{brand}:{cluster_id}");
        let mut conn = self.inner.lock().await;
        let history: Vec<String> = redis::cmd("LRANGE")
            .arg(&key)
            .arg(0)
            .arg(-1)
            .query_async(&mut *conn)
            .await
            .context("Redis LRANGE failed for spike history")?;
        Ok(history
            .into_iter()
            .filter_map(|value| value.parse::<i64>().ok())
            .collect())
    }

    pub async fn append_spike_history(
        &self,
        prefix: &str,
        brand: &str,
        cluster_id: i32,
        value: i64,
        ttl: Duration,
    ) -> anyhow::Result<()> {
        let key = format!("{prefix}:{brand}:{cluster_id}");
        let mut conn = self.inner.lock().await;
        let mut pipe = redis::pipe();
        pipe.cmd("LPUSH").arg(&key).arg(value).ignore();
        pipe.cmd("LTRIM").arg(&key).arg(0).arg(99).ignore();
        pipe.cmd("EXPIRE")
            .arg(&key)
            .arg(ttl.as_secs() as usize)
            .ignore();
        pipe.query_async::<_, ()>(&mut *conn)
            .await
            .context("Redis pipeline failed for spike history")
    }
}
