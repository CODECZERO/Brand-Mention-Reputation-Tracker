use once_cell::sync::Lazy;
use prometheus::{register_counter_vec, register_histogram_vec, register_int_gauge_vec, Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGaugeVec, TextEncoder};

pub static WORKER_CHUNKS_PROCESSED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    register_counter_vec!(
        "worker_chunks_processed_total",
        "Total number of chunks processed successfully",
        &("worker_id", "brand")
    )
    .expect("register worker_chunks_processed_total")
});

pub static WORKER_CHUNKS_FAILED_TOTAL: Lazy<IntCounterVec> = Lazy::new(|| {
    register_counter_vec!(
        "worker_chunks_failed_total",
        "Total number of chunks that failed processing",
        &("worker_id", "brand", "reason")
    )
    .expect("register worker_chunks_failed_total")
});

pub static WORKER_PROCESSING_TIME_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_processing_time_seconds",
        "Histogram of total chunk processing duration",
        &("worker_id", "brand"),
        vec![0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]
    )
    .expect("register worker_processing_time_seconds")
});

pub static WORKER_IO_TIME_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    let opts = HistogramOpts::new("worker_io_time_seconds", "Histogram of Redis IO durations per chunk")
        .buckets(vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]);
    register_histogram_vec!(opts, &("worker_id", "brand", "stage")).expect("register worker_io_time_seconds")
});

pub static WORKER_WAITING_SECONDS: Lazy<IntGaugeVec> = Lazy::new(|| {
    register_int_gauge_vec!(
        "worker_waiting_seconds",
        "Seconds the worker has been waiting for new tasks",
        &("worker_id")
    )
    .expect("register worker_waiting_seconds")
});

pub static WORKER_PREPROCESSING_TIME_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_preprocessing_time_seconds",
        "Histogram of preprocessing durations",
        &("worker_id", "brand"),
        vec![0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
    )
    .expect("register worker_preprocessing_time_seconds")
});

pub static WORKER_EMBEDDING_TIME_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_embedding_time_seconds",
        "Histogram of embedding generation time",
        &("worker_id", "brand"),
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
    )
    .expect("register worker_embedding_time_seconds")
});

pub static WORKER_CLUSTERING_TIME_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_clustering_time_seconds",
        "Histogram of clustering durations",
        &("worker_id", "brand"),
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0]
    )
    .expect("register worker_clustering_time_seconds")
});

pub static WORKER_LLM_LATENCY_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_llm_latency_seconds",
        "Histogram of LLM request latency",
        &("worker_id", "brand", "operation"),
        vec![0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
    )
    .expect("register worker_llm_latency_seconds")
});

pub static WORKER_SPIKE_DETECTION_SECONDS: Lazy<HistogramVec> = Lazy::new(|| {
    register_histogram_vec!(
        "worker_spike_detection_seconds",
        "Histogram of spike detection latency",
        &("worker_id", "brand"),
        vec![0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
    )
    .expect("register worker_spike_detection_seconds")
});

pub fn gather_metrics() -> String {
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    TextEncoder::new()
        .encode(&metric_families, &mut buffer)
        .expect("encode metrics");
    String::from_utf8(buffer).unwrap_or_default()
}
