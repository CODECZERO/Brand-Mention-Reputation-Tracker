use std::time::Instant;

use tracing::info;

use crate::metrics::WORKER_CLUSTERING_TIME_SECONDS;

#[derive(Debug, Clone)]
pub struct ClusterGroup {
    pub cluster_id: i32,
    pub indices: Vec<usize>,
}

#[derive(Debug, Clone)]
pub struct ClusteringOutput {
    pub clusters: Vec<ClusterGroup>,
    pub duration_ms: f64,
}

pub struct Clusterer {
    worker_id: String,
}

impl Clusterer {
    pub fn new(worker_id: String) -> Self {
        Self { worker_id }
    }

    pub async fn cluster(
        &self,
        embeddings: &[Vec<f32>],
        brand: &str,
        chunk_id: &str,
    ) -> ClusteringOutput {
        let start = Instant::now();
        let indices: Vec<usize> = (0..embeddings.len()).collect();
        let cluster = ClusterGroup {
            cluster_id: 1,
            indices,
        };
        self.finish(vec![cluster], start, brand, chunk_id)
    }

    fn finish(
        &self,
        clusters: Vec<ClusterGroup>,
        start: Instant,
        brand: &str,
        chunk_id: &str,
    ) -> ClusteringOutput {
        let duration = start.elapsed();
        WORKER_CLUSTERING_TIME_SECONDS
            .with_label_values(&[&self.worker_id, brand])
            .observe(duration.as_secs_f64());
        info!(worker_id = %self.worker_id, brand, chunk_id, clusters = clusters.len(), "Clustering completed");
        ClusteringOutput {
            clusters,
            duration_ms: duration.as_secs_f64() * 1000.0,
        }
    }
}
