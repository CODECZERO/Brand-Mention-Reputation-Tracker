import { Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();
registry.setDefaultLabels({ service: "service3-orchestrator" });

export const brandsProcessedTotal = new Counter({
  name: "orchestrator_brands_processed_total",
  help: "Total number of brands processed",
  registers: [registry],
});

export const chunksMergedTotal = new Counter({
  name: "orchestrator_chunks_merged_total",
  help: "Total number of chunk results merged",
  registers: [registry],
});

export const clustersAggregatedTotal = new Counter({
  name: "orchestrator_clusters_aggregated_total",
  help: "Total number of clusters aggregated",
  registers: [registry],
});

export const processingTimeSeconds = new Histogram({
  name: "orchestrator_processing_time_seconds",
  help: "Total processing time per brand",
  buckets: [0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [registry],
});

export const ioTimeSeconds = new Histogram({
  name: "orchestrator_io_time_seconds",
  help: "IO wait time while fetching chunk results",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const redisReadLatencySeconds = new Histogram({
  name: "orchestrator_redis_read_latency_seconds",
  help: "Latency of Redis read operations while fetching chunks",
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [registry],
});

export const redisWriteLatencySeconds = new Histogram({
  name: "orchestrator_redis_write_latency_seconds",
  help: "Latency of Redis write operations when publishing summaries",
  buckets: [0.005, 0.01, 0.05, 0.1, 0.2, 0.5, 1, 2],
  registers: [registry],
});

export const memoryUsageBytes = new Gauge({
  name: "orchestrator_memory_usage_bytes",
  help: "Resident set size (RSS) memory usage of orchestrator",
  registers: [registry],
});

export const cpuUserTimeSeconds = new Gauge({
  name: "orchestrator_cpu_user_time_seconds",
  help: "Total user CPU time consumed by orchestrator process",
  registers: [registry],
});

export const cpuSystemTimeSeconds = new Gauge({
  name: "orchestrator_cpu_system_time_seconds",
  help: "Total system CPU time consumed by orchestrator process",
  registers: [registry],
});
