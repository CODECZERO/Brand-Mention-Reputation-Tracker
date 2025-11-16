"""Prometheus metrics definitions for the worker."""
from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

worker_chunks_processed_total = Counter(
    "worker_chunks_processed_total",
    "Total number of chunks processed successfully",
    labelnames=("worker_id", "brand"),
)

worker_chunks_failed_total = Counter(
    "worker_chunks_failed_total",
    "Total number of chunks that failed processing",
    labelnames=("worker_id", "brand", "reason"),
)

worker_processing_time_seconds = Histogram(
    "worker_processing_time_seconds",
    "Histogram of total chunk processing duration",
    labelnames=("worker_id", "brand"),
    buckets=(0.05, 0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0),
)

worker_io_time_seconds = Histogram(
    "worker_io_time_seconds",
    "Histogram of Redis IO durations per chunk",
    labelnames=("worker_id", "brand", "stage"),
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

worker_llm_latency_seconds = Histogram(
    "worker_llm_latency_seconds",
    "Histogram of LLM request latency",
    labelnames=("worker_id", "brand", "operation"),
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

worker_embedding_time_seconds = Histogram(
    "worker_embedding_time_seconds",
    "Histogram of embedding generation time",
    labelnames=("worker_id", "brand"),
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

worker_preprocessing_time_seconds = Histogram(
    "worker_preprocessing_time_seconds",
    "Histogram of preprocessing durations",
    labelnames=("worker_id", "brand"),
    buckets=(0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
)

worker_clustering_time_seconds = Histogram(
    "worker_clustering_time_seconds",
    "Histogram of clustering durations",
    labelnames=("worker_id", "brand"),
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0),
)

worker_waiting_seconds = Gauge(
    "worker_waiting_seconds",
    "Seconds the worker has been waiting for new tasks",
    labelnames=("worker_id",),
)

worker_spike_detection_seconds = Histogram(
    "worker_spike_detection_seconds",
    "Histogram of spike detection duration",
    labelnames=("worker_id", "brand"),
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
)
