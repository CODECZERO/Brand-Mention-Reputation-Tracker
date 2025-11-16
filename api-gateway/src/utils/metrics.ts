import { Histogram, Registry, collectDefaultMetrics, Counter } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const apiRequestsTotal = new Counter({
  name: "api_requests_total",
  help: "Total number of API requests",
  labelNames: ["route", "method", "status"],
  registers: [registry],
});

export const apiResponseTimeSeconds = new Histogram({
  name: "api_response_time_seconds",
  help: "Histogram of API response times",
  labelNames: ["route", "method"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const redisLatencySeconds = new Histogram({
  name: "redis_latency_seconds",
  help: "Histogram of Redis call latency",
  labelNames: ["operation"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});
