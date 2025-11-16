import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";
import { env } from "../../config/env.js";

const noopTimer = (): void => {
  // No-op timer where metrics are disabled.
};

export class MetricsService {
  private readonly registry: Registry;
  private readonly fetchHistogram: Histogram<string>;
  private readonly redisWriteHistogram: Histogram<string>;
  private readonly normalizationHistogram: Histogram<string>;
  private readonly dedupHistogram: Histogram<string>;
  private readonly dbLatencyHistogram: Histogram<string>;
  private readonly mentionsCounter: Counter<string>;
  private readonly invalidMentionsCounter: Counter<string>;
  private readonly duplicateMentionsCounter: Counter<string>;
  private readonly brandsGauge: Gauge<string>;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = env.aggregator.metricsEnabled;
    this.registry = new Registry();

    if (this.enabled) {
      collectDefaultMetrics({ register: this.registry });
    }

    this.fetchHistogram = new Histogram({
      name: "aggregator_fetch_seconds",
      help: "Duration of external fetch operations",
      labelNames: ["platform", "brand"],
      registers: [this.registry],
    });

    this.redisWriteHistogram = new Histogram({
      name: "aggregator_redis_write_seconds",
      help: "Duration of Redis write operations",
      labelNames: ["brand"],
      registers: [this.registry],
    });

    this.normalizationHistogram = new Histogram({
      name: "aggregator_normalization_seconds",
      help: "Duration of mention normalization",
      labelNames: ["platform", "brand"],
      registers: [this.registry],
    });

    this.dedupHistogram = new Histogram({
      name: "aggregator_dedup_seconds",
      help: "Duration of mention deduplication",
      labelNames: ["brand"],
      registers: [this.registry],
    });

    this.dbLatencyHistogram = new Histogram({
      name: "aggregator_db_latency_seconds",
      help: "Latency of database operations",
      labelNames: ["operation"],
      registers: [this.registry],
    });

    this.mentionsCounter = new Counter({
      name: "aggregator_mentions_fetched_total",
      help: "Total number of mentions fetched",
      labelNames: ["platform", "brand"],
      registers: [this.registry],
    });

    this.invalidMentionsCounter = new Counter({
      name: "aggregator_mentions_invalid_total",
      help: "Total number of mentions discarded during validation",
      labelNames: ["brand", "reason"],
      registers: [this.registry],
    });

    this.duplicateMentionsCounter = new Counter({
      name: "aggregator_mentions_duplicate_total",
      help: "Total number of duplicate mentions filtered",
      labelNames: ["brand"],
      registers: [this.registry],
    });

    this.brandsGauge = new Gauge({
      name: "aggregator_brands_tracked_total",
      help: "Number of brands currently being tracked",
      registers: [this.registry],
    });
  }

  startFetchTimer(platform: string, brand: string): () => void {
    if (!this.enabled) {
      return noopTimer;
    }

    return this.fetchHistogram.startTimer({ platform, brand });
  }

  startRedisWriteTimer(brand: string): () => void {
    if (!this.enabled) {
      return noopTimer;
    }

    return this.redisWriteHistogram.startTimer({ brand });
  }

  startNormalizationTimer(platform: string, brand: string): () => void {
    if (!this.enabled) {
      return noopTimer;
    }

    return this.normalizationHistogram.startTimer({ platform, brand });
  }

  startDedupTimer(brand: string): () => void {
    if (!this.enabled) {
      return noopTimer;
    }

    return this.dedupHistogram.startTimer({ brand });
  }

  observeDbLatency(operation: string, durationMs: number): void {
    if (!this.enabled) {
      return;
    }

    this.dbLatencyHistogram.observe({ operation }, durationMs / 1000);
  }

  incrementMentions(platform: string, brand: string, count: number): void {
    if (!this.enabled || count <= 0) {
      return;
    }

    this.mentionsCounter.inc({ platform, brand }, count);
  }

  recordInvalidMentions(brand: string, count: number, reason: string): void {
    if (!this.enabled || count <= 0) {
      return;
    }

    this.invalidMentionsCounter.inc({ brand, reason }, count);
  }

  recordDuplicateMentions(brand: string, count: number): void {
    if (!this.enabled || count <= 0) {
      return;
    }

    this.duplicateMentionsCounter.inc({ brand }, count);
  }

  setBrandsTracked(count: number): void {
    if (!this.enabled) {
      return;
    }

    this.brandsGauge.set(count);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getMetrics(): Promise<string> {
    return this.enabled
      ? this.registry.metrics()
      : "# Metrics collection disabled";
  }
}
