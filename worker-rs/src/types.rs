use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub id: String,
    pub source: String,
    pub text: String,
    #[serde(rename = "created_at")]
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub sentiment: Option<HashMap<String, f32>>,
    #[serde(default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChunkMeta {
    #[serde(default)]
    pub chunk_index: Option<i32>,
    #[serde(default)]
    pub total_chunks: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Chunk {
    pub brand: String,
    #[serde(rename = "chunkId")]
    pub chunk_id: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime<Utc>,
    pub mentions: Vec<Mention>,
    #[serde(default)]
    pub meta: Option<ChunkMeta>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChunkMetrics {
    pub preprocessing_time_ms: f64,
    pub embedding_time_ms: f64,
    pub clustering_time_ms: f64,
    pub llm_time_ms: f64,
    pub spike_detection_time_ms: f64,
    pub io_time_ms: f64,
    pub total_task_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClusterResult {
    pub cluster_id: i32,
    pub count: usize,
    pub examples: Vec<String>,
    pub summary: Option<String>,
    pub spike: bool,
    pub sentiment: HashMap<String, f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topics: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChunkResult {
    pub chunk_id: String,
    pub brand: String,
    pub timestamp: i64,
    pub clusters: Vec<ClusterResult>,
    pub metrics: ChunkMetrics,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FailureRecord {
    pub worker_id: String,
    pub brand: String,
    pub chunk_id: String,
    pub reason: String,
    pub payload: String,
}
