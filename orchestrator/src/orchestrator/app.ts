import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import pLimit from "p-limit";
import closeWithGrace from "close-with-grace";
import { performance } from "node:perf_hooks";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { getRedisClient, disconnectRedis } from "./redis_client.js";
import { fetchChunkResults } from "./result_collector.js";
import { aggregateBrandChunks } from "./aggregator.js";
import { generateSummary } from "./summary_generator.js";
import { loadRegisteredBrands } from "./brand_registry.js";
import {
  brandsProcessedTotal,
  chunksMergedTotal,
  clustersAggregatedTotal,
  processingTimeSeconds,
  ioTimeSeconds,
  redisWriteLatencySeconds,
  memoryUsageBytes,
  cpuUserTimeSeconds,
  cpuSystemTimeSeconds,
  registry,
} from "./metrics.js";
import { buildSummaryKey, exponentialBackoff, measureAsync, sleep } from "./utils.js";
import {
  buildHealthPayload,
  createHealthSnapshot,
  updateHealthOnStart,
  updateHealthOnFinish,
} from "./health.js";
import { logRecoverableError } from "./error_utils.js";

export class OrchestratorApp {
  private readonly redis = getRedisClient();
  private readonly limiter = pLimit(config.CONCURRENCY_LIMIT);
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private httpServer: FastifyInstance | null = null;
  private metricsServer: FastifyInstance | null = null;
  private readonly health = createHealthSnapshot();

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;

    if (config.warnings.length > 0) {
      config.warnings.forEach((warning) => {
        logger.warn({ warning }, "Configuration warning");
      });
    }

    await Promise.all([this.startHttpServer(), this.startMetricsServer()]);
    this.loopPromise = this.runLoop().catch((error) => {
      logRecoverableError(logger, error, { location: "runLoop" }, "Orchestrator loop crashed");
      process.exitCode = 1;
    });

    closeWithGrace({ delay: 500 }, async ({ signal, err }: { signal?: string | number; err?: unknown; manual?: boolean }) => {
      if (err) {
        logger.error({ err, signal }, "Graceful shutdown due to error");
      } else {
        logger.info({ signal }, "Graceful shutdown initiated");
      }
      await this.stop();
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;

    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }

    await Promise.all([this.stopHttpServer(), this.stopMetricsServer()]);
    await disconnectRedis();
    logger.info("Orchestrator stopped");
  }

  private async startHttpServer(): Promise<void> {
    if (this.httpServer) return;

    const server = Fastify({ logger: false });
    await server.register(cors, { origin: true, credentials: true });
    await server.register(helmet, { global: true });

    server.get("/health", async () => this.getHealth());

    await server.listen({ port: config.HTTP_PORT, host: "0.0.0.0" });
    logger.info({ port: config.HTTP_PORT }, "HTTP health server listening");
    this.httpServer = server;
  }

  private async stopHttpServer(): Promise<void> {
    if (!this.httpServer) return;
    await this.httpServer.close();
    this.httpServer = null;
  }

  private async startMetricsServer(): Promise<void> {
    if (this.metricsServer) return;

    const server = Fastify({ logger: false });

    server.get("/metrics", async (_request: FastifyRequest, reply: FastifyReply) => {
      const body = await registry.metrics();
      reply.header("Content-Type", registry.contentType);
      return reply.send(body);
    });

    await server.listen({ port: config.PROMETHEUS_PORT, host: "0.0.0.0" });
    logger.info({ port: config.PROMETHEUS_PORT }, "Metrics server listening");
    this.metricsServer = server;
  }

  private async stopMetricsServer(): Promise<void> {
    if (!this.metricsServer) return;
    await this.metricsServer.close();
    this.metricsServer = null;
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const brands = await loadRegisteredBrands(this.redis);
        if (brands.length === 0) {
          logger.debug("No brands registered; sleeping");
          await sleep(config.SCHEDULE_INTERVAL_MS / 1000);
          continue;
        }

        await Promise.all(
          brands.map((brand) =>
            this.limiter(() =>
              this.processBrand(brand).catch((error) =>
                logRecoverableError(logger, error, { location: "processBrand", brand }, "Failed to process brand")
              )
            )
          )
        );
      } catch (error) {
        logRecoverableError(logger, error, { location: "runLoop" }, "Error in orchestrator loop; backing off");
        await sleep(config.RETRY_BACKOFF_BASE);
      }

      await sleep(config.SCHEDULE_INTERVAL_MS / 1000);
    }
  }

  private async processBrand(brand: string): Promise<void> {
    console.log(`[orchestrator] Processing brand ${brand}`);
    updateHealthOnStart(this.health, brand);
    const totalStart = performance.now();

    const { result: chunkFetchResult, durationMs: fetchDurationMs } = await measureAsync(() => fetchChunkResults(this.redis, brand));

    console.log(
      "[orchestrator] Raw chunk payload",
      JSON.stringify({
        brand,
        chunks: chunkFetchResult.chunks.slice(0, 3),
        totalChunks: chunkFetchResult.chunks.length,
        ioMs: chunkFetchResult.ioMs,
      }, null, 2),
    );

    if (chunkFetchResult.chunks.length === 0) {
      console.log(`[orchestrator] No data available for brand ${brand}`);
      logger.info({ brand }, `No data for brand ${brand}`);
      updateHealthOnFinish(this.health, brand, false);
      return;
    }

    const { result: aggregatedData, durationMs: mergeMs } = await measureAsync(async () =>
      Promise.resolve(aggregateBrandChunks(brand, chunkFetchResult.chunks))
    );

    console.log(
      "[orchestrator] Aggregated data",
      JSON.stringify({
        brand,
        totalChunks: aggregatedData.totalChunks,
        totalMentions: aggregatedData.totalMentions,
        clustersPreview: aggregatedData.clusters.slice(0, 3),
        spikeDetected: aggregatedData.spikeDetected,
      }, null, 2),
    );

    const { result: summary, durationMs: summaryMs } = await measureAsync(async () =>
      Promise.resolve(generateSummary(aggregatedData))
    );

    console.log(
      "[orchestrator] Generated summary",
      JSON.stringify({ brand, summary }, null, 2),
    );

    const { durationMs: writeDurationMs } = await measureAsync(() =>
      exponentialBackoff(() =>
        this.redis.set(buildSummaryKey(brand), JSON.stringify(summary), "EX", config.TTL_SUMMARY_SECONDS)
      )
    );
    redisWriteLatencySeconds.observe(writeDurationMs / 1000);

    brandsProcessedTotal.inc();
    chunksMergedTotal.inc(chunkFetchResult.chunks.length);
    clustersAggregatedTotal.inc(aggregatedData.clusters.length);
    const totalDurationMs = performance.now() - totalStart;
    processingTimeSeconds.observe(totalDurationMs / 1000);
    ioTimeSeconds.observe(chunkFetchResult.ioMs / 1000);

    const memory = process.memoryUsage();
    memoryUsageBytes.set(memory.rss);
    const usage = process.resourceUsage();
    const userCpuSeconds = usage.userCPUTime / 1_000_000;
    const systemCpuSeconds = usage.systemCPUTime / 1_000_000;
    cpuUserTimeSeconds.set(userCpuSeconds);
    cpuSystemTimeSeconds.set(systemCpuSeconds);

    logger.info(
      {
        brand,
        chunks: chunkFetchResult.chunks.length,
        totalMentions: aggregatedData.totalMentions,
        ioMs: Number(chunkFetchResult.ioMs.toFixed(2)),
        mergeMs: Number(mergeMs.toFixed(2)),
        summaryMs: Number(summaryMs.toFixed(2)),
        processedMs: Number(totalDurationMs.toFixed(2)),
        redisReadMs: Number(fetchDurationMs.toFixed(2)),
        redisWriteMs: Number(writeDurationMs.toFixed(2)),
        memoryRssBytes: memory.rss,
        cpuUserSeconds: Number(userCpuSeconds.toFixed(3)),
        cpuSystemSeconds: Number(systemCpuSeconds.toFixed(3)),
        spikeDetected: aggregatedData.spikeDetected,
      },
      "Brand summary generated"
    );

    console.log(
      `[orchestrator] Finished processing ${brand}: chunks=${chunkFetchResult.chunks.length}, mentions=${aggregatedData.totalMentions}`
    );

    updateHealthOnFinish(this.health, brand, true);
  }

  getHealth() {
    return buildHealthPayload(this.health, config.ORCHESTRATOR_ID);
  }
}
