use std::time::Duration;

use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
struct RawSettings {
    #[serde(rename = "REDIS_URL")]
    redis_url: String,
    #[serde(rename = "WORKER_ID")]
    worker_id: Option<String>,
    #[serde(rename = "CHUNK_BATCH_SIZE", default = "default_chunk_batch_size")]
    chunk_batch_size: usize,
    #[serde(rename = "HTTP_PORT", default = "default_http_port")]
    http_port: u16,
    #[serde(rename = "PROMETHEUS_PORT", default = "default_prometheus_port")]
    prometheus_port: u16,
    #[serde(rename = "LOG_LEVEL", default = "default_log_level")]
    log_level: String,
    #[serde(rename = "HEARTBEAT_INTERVAL_SEC", default = "default_heartbeat_interval")]
    heartbeat_interval_sec: u64,
    #[serde(rename = "BLPOP_TIMEOUT_SEC", default = "default_blpop_timeout")]
    blpop_timeout_sec: u64,
    #[serde(rename = "REDIS_QUEUE_PREFIX", default = "default_queue_prefix")]
    redis_queue_prefix: String,
    #[serde(rename = "REDIS_RESULT_PREFIX", default = "default_result_prefix")]
    redis_result_prefix: String,
    #[serde(rename = "REDIS_FAILED_PREFIX", default = "default_failed_prefix")]
    redis_failed_prefix: String,
    #[serde(rename = "REDIS_SPIKE_PREFIX", default = "default_spike_prefix")]
    redis_spike_prefix: String,
    #[serde(rename = "MAX_RETRIES", default = "default_max_retries")]
    max_retries: u32,
    #[serde(rename = "RETRY_BACKOFF_BASE", default = "default_retry_backoff_base")]
    retry_backoff_base: f64,
    #[serde(rename = "METRICS_WAIT_LOG_INTERVAL_SEC", default = "default_metrics_wait_log_interval")]
    metrics_wait_log_interval_sec: u64,
    #[serde(rename = "PREPROCESSING_EXAMPLES", default = "default_preprocessing_examples")]
    preprocessing_examples: usize,
    #[serde(rename = "EMBEDDINGS_PROVIDER", default = "default_embeddings_provider")]
    embeddings_provider: String,
    #[serde(rename = "LLM_PROVIDER", default = "default_llm_provider")]
    llm_provider: String,
    #[serde(rename = "EMBEDDING_API_KEY")]
    embedding_api_key: Option<String>,
    #[serde(rename = "LLM_API_KEY")]
    llm_api_key: Option<String>,
    #[serde(rename = "GEMINI_API_KEY")]
    gemini_api_key: Option<String>,
    #[serde(rename = "OPENAI_API_KEY")]
    openai_api_key: Option<String>,
    #[serde(rename = "GEMINI_MODEL", default = "default_gemini_model")]
    gemini_model: String,
    #[serde(rename = "GEMINI_API_VERSION", default = "default_gemini_api_version")]
    gemini_api_version: String,
    #[serde(rename = "OPENAI_MODEL", default = "default_openai_model")]
    openai_model: String,
    #[serde(rename = "LLM_SUMMARY_MAX_TOKENS", default = "default_llm_summary_max_tokens")]
    llm_summary_max_tokens: u32,
    #[serde(rename = "LLM_TIMEOUT_SEC", default = "default_llm_timeout_sec")]
    llm_timeout_sec: u64,
    #[serde(rename = "LLM_MIN_DELAY_SEC", default = "default_llm_min_delay_sec")]
    llm_min_delay_sec: f64,
    #[serde(rename = "EMBEDDINGS_BATCH_SIZE", default = "default_embeddings_batch_size")]
    embeddings_batch_size: usize,
    #[serde(rename = "LLM_MAX_CONCURRENCY", default = "default_llm_max_concurrency")]
    llm_max_concurrency: usize,
    #[serde(rename = "SPIKE_HISTORY_TTL_SEC", default = "default_spike_history_ttl_sec")]
    spike_history_ttl_sec: u64,
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub redis_url: String,
    pub worker_id: String,
    pub chunk_batch_size: usize,
    pub http_port: u16,
    pub prometheus_port: u16,
    pub log_level: String,
    pub heartbeat_interval: Duration,
    pub blpop_timeout: Duration,
    pub redis_queue_prefix: String,
    pub redis_result_prefix: String,
    pub redis_failed_prefix: String,
    pub redis_spike_prefix: String,
    pub max_retries: u32,
    pub retry_backoff_base: f64,
    pub metrics_wait_log_interval: Duration,
    pub preprocessing_examples: usize,
    pub embeddings_provider: String,
    pub llm_provider: String,
    pub embedding_api_key: Option<String>,
    pub llm_api_key: Option<String>,
    pub gemini_api_key: Option<String>,
    pub openai_api_key: Option<String>,
    pub gemini_model: String,
    pub gemini_api_version: String,
    pub openai_model: String,
    pub llm_summary_max_tokens: u32,
    pub llm_timeout: Duration,
    pub llm_min_delay: Duration,
    pub embeddings_batch_size: usize,
    pub llm_max_concurrency: usize,
    pub spike_history_ttl: Duration,
}

impl Settings {
    pub fn from_env() -> Result<Self, envy::Error> {
        let raw: RawSettings = envy::from_env()?;
        Ok(Self::from_raw(raw))
    }

    fn from_raw(raw: RawSettings) -> Self {
        let worker_id = raw
            .worker_id
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| format!("worker-{}", Uuid::new_v4()))
            .to_lowercase();

        Self {
            redis_url: raw.redis_url,
            worker_id,
            chunk_batch_size: raw.chunk_batch_size.max(1),
            http_port: raw.http_port,
            prometheus_port: raw.prometheus_port,
            log_level: raw.log_level.to_ascii_lowercase(),
            heartbeat_interval: Duration::from_secs(raw.heartbeat_interval_sec.max(1)),
            blpop_timeout: Duration::from_secs(raw.blpop_timeout_sec.max(1)),
            redis_queue_prefix: raw.redis_queue_prefix,
            redis_result_prefix: raw.redis_result_prefix,
            redis_failed_prefix: raw.redis_failed_prefix,
            redis_spike_prefix: raw.redis_spike_prefix,
            max_retries: raw.max_retries,
            retry_backoff_base: raw.retry_backoff_base.max(0.0),
            metrics_wait_log_interval: Duration::from_secs(raw.metrics_wait_log_interval_sec.max(1)),
            preprocessing_examples: raw.preprocessing_examples.clamp(1, 100),
            embeddings_provider: raw.embeddings_provider.to_ascii_lowercase(),
            llm_provider: raw.llm_provider.to_ascii_lowercase(),
            embedding_api_key: raw.embedding_api_key.filter(|s| !s.trim().is_empty()),
            llm_api_key: raw.llm_api_key.filter(|s| !s.trim().is_empty()),
            gemini_api_key: raw.gemini_api_key.filter(|s| !s.trim().is_empty()),
            openai_api_key: raw.openai_api_key.filter(|s| !s.trim().is_empty()),
            gemini_model: raw.gemini_model,
            gemini_api_version: raw.gemini_api_version,
            openai_model: raw.openai_model,
            llm_summary_max_tokens: raw.llm_summary_max_tokens.max(16),
            llm_timeout: Duration::from_secs(raw.llm_timeout_sec.max(1)),
            llm_min_delay: Duration::from_secs_f64(raw.llm_min_delay_sec.max(0.0)),
            embeddings_batch_size: raw.embeddings_batch_size.max(1),
            llm_max_concurrency: raw.llm_max_concurrency.max(1),
            spike_history_ttl: Duration::from_secs(raw.spike_history_ttl_sec.max(60)),
        }
    }
}

fn default_chunk_batch_size() -> usize {
    200
}

fn default_http_port() -> u16 {
    8000
}

fn default_prometheus_port() -> u16 {
    8001
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_heartbeat_interval() -> u64 {
    10
}

fn default_blpop_timeout() -> u64 {
    5
}

fn default_queue_prefix() -> String {
    "queue:brand".to_string()
}

fn default_result_prefix() -> String {
    "result:brand".to_string()
}

fn default_failed_prefix() -> String {
    "failed:brand".to_string()
}

fn default_spike_prefix() -> String {
    "spike:brand".to_string()
}

fn default_max_retries() -> u32 {
    3
}

fn default_retry_backoff_base() -> f64 {
    0.5
}

fn default_metrics_wait_log_interval() -> u64 {
    60
}

fn default_preprocessing_examples() -> usize {
    3
}

fn default_embeddings_provider() -> String {
    "local".to_string()
}

fn default_llm_provider() -> String {
    "mock".to_string()
}

fn default_gemini_model() -> String {
    "gemini-2.5-flash".to_string()
}

fn default_gemini_api_version() -> String {
    "v1".to_string()
}

fn default_openai_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_llm_summary_max_tokens() -> u32 {
    256
}

fn default_llm_timeout_sec() -> u64 {
    30
}

fn default_llm_min_delay_sec() -> f64 {
    0.0
}

fn default_embeddings_batch_size() -> usize {
    32
}

fn default_llm_max_concurrency() -> usize {
    4
}

fn default_spike_history_ttl_sec() -> u64 {
    86_400
}
