import { randomUUID } from "node:crypto";
import { env } from "../../../config/env.js";
import { logger } from "../../../utils/logger.js";
import type { MentionProvider } from "../types/provider.js";
import type { MentionPlatform, NormalizedMention } from "../types/mention.js";
import { MentionNormalizerService } from "./normalizer.service.js";
import { MentionValidatorService } from "./validator.service.js";
import { MentionDeduplicationService } from "./deduplication.service.js";
import { RedisWriterService } from "./redis-writer.service.js";
import type { TrackedBrand } from "../../brands/types/brand.js";
import { BrandService } from "../../brands/services/brand.service.js";
import { MetricsService } from "../../metrics/metrics.service.js";

export type AggregatorTrigger = "scheduler" | "manual";

export interface AggregationSummary {
  brand: string;
  platform: MentionPlatform;
  fetchedCount: number;
  storedCount: number;
  invalidCount: number;
  duplicateCount: number;
  truncatedCount: number;
  fetchDurationMs: number;
  redisDurationMs: number;
  error?: string;
}

function buildSyntheticMention(brand: string, platform: MentionPlatform): NormalizedMention {
  return {
    id: `synthetic-${randomUUID()}`,
    brand,
    text: `${brand} update pending for ${platform}.`,
    timestamp: Date.now(),
    source: platform,
    metadata: {
      author: "system",
      url: "https://dashboard.local/synthetic",
      raw: {
        reason: "synthetic",
      },
      synthetic: true,
    },
  } satisfies NormalizedMention;
}

export interface AggregatorStatus {
  isRunning: boolean;
  lastRunAt?: string;
  lastRunDurationMs?: number;
  lastError?: string;
  lastSummaries: AggregationSummary[];
}

export class AggregatorService {
  private readonly status: AggregatorStatus = {
    isRunning: false,
    lastSummaries: [],
  };
  private trackedBrandsSnapshot = new Set<string>();

  constructor(
    private readonly brandService: BrandService,
    private readonly providers: MentionProvider[],
    private readonly normalizer: MentionNormalizerService,
    private readonly validator: MentionValidatorService,
    private readonly redisWriter: RedisWriterService,
    private readonly metrics: MetricsService,
  ) {}

  getStatus(): AggregatorStatus {
    return {
      ...this.status,
      lastSummaries: this.status.lastSummaries.map((summary) => ({ ...summary })),
    };
  }

  async triggerManualRun(): Promise<boolean> {
    if (this.status.isRunning) {
      return false;
    }

    await this.runCycle("manual");
    return true;
  }

  async runCycle(trigger: AggregatorTrigger = "scheduler"): Promise<void> {
    if (this.status.isRunning) {
      logger.warn({ trigger }, "Aggregator cycle already in progress");
      return;
    }

    this.status.isRunning = true;
    this.status.lastError = undefined;

    const cycleStart = Date.now();
    const cpuStart = process.cpuUsage();
    const summaries: AggregationSummary[] = [];
    logger.info({ trigger }, "Aggregator cycle started");

    try {
      const brandFetchStart = Date.now();
      const brands = await this.brandService.getTrackedBrands();
      this.metrics.observeDbLatency("brands.findAll", Date.now() - brandFetchStart);

      const normalizedBrandNames = brands.map((brand) => brand.name.trim()).filter(Boolean);
      logger.debug({ trigger, brands: normalizedBrandNames }, "Loaded tracked brands");
      this.metrics.setBrandsTracked(brands.length);

      if (brands.length === 0) {
        if (this.trackedBrandsSnapshot.size > 0) {
          for (const previous of this.trackedBrandsSnapshot) {
            await this.redisWriter.purgeBrandData(previous);
          }
          this.trackedBrandsSnapshot.clear();
        }
        logger.warn({ trigger }, "No brands available. Aggregator cycle skipped.");
        return;
      }

      const currentBrandSet = new Set(normalizedBrandNames.map((name) => name.toLowerCase()));
      for (const previous of this.trackedBrandsSnapshot) {
        if (!currentBrandSet.has(previous)) {
          await this.redisWriter.purgeBrandData(previous);
        }
      }

      for (const brand of brands) {
        try {
          const slug = await this.redisWriter.registerBrand(brand);
          logger.debug({ trigger, brand: brand.name, slug }, "Registered brand in Redis");
        } catch (error) {
          logger.error({ trigger, brand: brand.name, error }, "Failed to register brand in Redis");
        }

        await this.processBrand(brand, trigger, summaries);
      }

      const cycleDurationMs = Date.now() - cycleStart;
      const cpuUsage = process.cpuUsage(cpuStart);
      const memoryUsage = process.memoryUsage();

      logger.info({
        trigger,
        brands: brands.length,
        cycleDurationMs,
        cpuUsage,
        memoryUsage,
      }, "Aggregator cycle completed");
      this.trackedBrandsSnapshot = currentBrandSet;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.status.lastError = message;
      logger.error({ trigger, error }, "Aggregator cycle failed");
    } finally {
      this.status.lastSummaries = summaries.map((summary) => ({ ...summary }));
      this.status.lastRunAt = new Date().toISOString();
      this.status.lastRunDurationMs = Date.now() - cycleStart;
      this.status.isRunning = false;
    }
  }

  private async processBrand(
    brand: TrackedBrand,
    trigger: AggregatorTrigger,
    summaries: AggregationSummary[],
  ): Promise<void> {
    const deduplicator = new MentionDeduplicationService();
    let brandStoredCount = 0;

    for (const provider of this.providers) {
      if (!provider.isEnabled(brand)) {
        continue;
      }

      const summary = await this.processProvider(brand, provider, trigger, deduplicator);
      summaries.push(summary);
      brandStoredCount += summary.storedCount;
    }

    if (brandStoredCount === 0) {
      logger.info({ brand: brand.name, trigger }, `No new data for brand ${brand.name}`);
    }
  }

  private async processProvider(
    brand: TrackedBrand,
    provider: MentionProvider,
    trigger: AggregatorTrigger,
    deduplicator: MentionDeduplicationService,
  ): Promise<AggregationSummary> {
    const fetchStart = Date.now();
    const stopFetchTimer = this.metrics.startFetchTimer(provider.platform, brand.name);
    let normalizedMentions: NormalizedMention[] = [];
    let redisDurationMs = 0;
    let fetchTimerStopped = false;

    try {
      const rawMentions = await provider.fetchMentions(brand);
      const fetchDurationMs = Date.now() - fetchStart;
      stopFetchTimer();
      fetchTimerStopped = true;

      const cappedMentions = (rawMentions.length === 0)
        ? []
        : rawMentions.slice(0, env.aggregator.maxFetchLimit);
      const truncatedCount = rawMentions.length - cappedMentions.length;

      if (truncatedCount > 0) {
        logger.warn({ brand: brand.name, platform: provider.platform, truncatedCount }, "Provider results truncated to max fetch limit");
      }

      const stopNormalizationTimer = this.metrics.startNormalizationTimer(provider.platform, brand.name);
      try {
        normalizedMentions = cappedMentions.map((mention) => this.normalizer.normalize(mention, brand.name));
      } finally {
        stopNormalizationTimer();
      }

      const { valid, invalid } = this.validator.filterValid(normalizedMentions);
      if (invalid.length > 0) {
        this.metrics.recordInvalidMentions(brand.name, invalid.length, "schema");
      }

      const stopDedupTimer = this.metrics.startDedupTimer(brand.name);
      let uniqueMentions: NormalizedMention[] = [];
      let duplicateCount = 0;
      try {
        const dedupResult = deduplicator.deduplicate(valid);
        uniqueMentions = dedupResult.unique;
        duplicateCount = dedupResult.duplicates.length;
      } finally {
        stopDedupTimer();
      }

      if (duplicateCount > 0) {
        this.metrics.recordDuplicateMentions(brand.name, duplicateCount);
      }

      let mentionsToStore = uniqueMentions;
      if (mentionsToStore.length === 0) {
        const synthetic = buildSyntheticMention(brand.name, provider.platform);
        mentionsToStore = [synthetic];
        logger.info({ brand: brand.name, platform: provider.platform, trigger }, "No valid mentions returned; injecting synthetic mention to maintain pipeline flow");
      }

      const stopRedisTimer = this.metrics.startRedisWriteTimer(brand.name);
      const redisStart = Date.now();
      const storedCount = await this.redisWriter.writeMentions(mentionsToStore);
      redisDurationMs = Date.now() - redisStart;
      stopRedisTimer();

      this.metrics.incrementMentions(provider.platform, brand.name, storedCount);

      logger.info({
        brand: brand.name,
        platform: provider.platform,
        trigger,
        count: storedCount,
        invalid: invalid.length,
        duplicates: duplicateCount,
        truncated: truncatedCount,
        fetchDurationMs,
        redisWriteDurationMs: redisDurationMs,
      }, "Stored mentions in Redis");

      try {
        const chunkLogStart = Date.now();
        const { chunkCount, slug, queueKey, chunkSize } = await this.redisWriter.enqueueMentionChunks(brand.name, mentionsToStore);
        const chunkLatency = Date.now() - chunkLogStart;
        logger.info({
          brand: brand.name,
          slug,
          queueKey,
          chunkCount,
          chunkSize,
          mentions: uniqueMentions.length,
          latencyMs: chunkLatency,
        }, "Enqueued mention chunks for worker consumption");
      } catch (chunkError) {
        logger.error({ brand: brand.name, platform: provider.platform, error: chunkError }, "Failed to enqueue mention chunks");
      }

      return {
        brand: brand.name,
        platform: provider.platform,
        fetchedCount: rawMentions.length,
        storedCount,
        invalidCount: invalid.length,
        duplicateCount,
        truncatedCount,
        fetchDurationMs,
        redisDurationMs,
      };
    } catch (error) {
      const fetchDurationMs = Date.now() - fetchStart;
      if (!fetchTimerStopped) {
        stopFetchTimer();
      }

      const message = error instanceof Error ? error.message : "Unknown error";
      logger.warn({
        brand: brand.name,
        platform: provider.platform,
        trigger,
        error,
        fetchDurationMs,
      }, "Failed to fetch mentions from provider");

      return {
        brand: brand.name,
        platform: provider.platform,
        fetchedCount: 0,
        storedCount: 0,
        invalidCount: 0,
        duplicateCount: 0,
        truncatedCount: 0,
        fetchDurationMs,
        redisDurationMs,
        error: message,
      };
    }
  }
}
