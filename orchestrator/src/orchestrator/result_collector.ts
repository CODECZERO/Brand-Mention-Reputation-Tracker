import type { Redis } from "ioredis";
import { performance } from "node:perf_hooks";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { ChunkResult } from "./types.js";
import { redisReadLatencySeconds } from "./metrics.js";
import { buildFailedKey, buildResultKey, safeJsonParse } from "./utils.js";

export interface FetchChunkResultsOutput {
  chunks: ChunkResult[];
  ioMs: number;
}

function isValidChunkResult(value: ChunkResult | null, expectedBrand: string): value is ChunkResult {
  if (!value) return false;
  if (value.brand !== expectedBrand) return false;
  if (typeof value.chunkId !== "string" || value.chunkId.length === 0) return false;
  if (!Array.isArray(value.clusters)) return false;
  if (!value.sentiment || typeof value.sentiment.score !== "number") return false;
  return true;
}

export async function fetchChunkResults(redis: Redis, brand: string): Promise<FetchChunkResultsOutput> {
  const queueKey = buildResultKey(brand);
  const failedKey = buildFailedKey(brand);
  const chunks: ChunkResult[] = [];
  let ioMs = 0;

  const waitStart = performance.now();
  const popped = await redis.blpop(queueKey, config.CHUNK_FETCH_TIMEOUT_SEC);
  const firstLatencyMs = performance.now() - waitStart;
  ioMs += firstLatencyMs;
  redisReadLatencySeconds.observe(firstLatencyMs / 1000);

  if (!popped) {
    return { chunks, ioMs };
  }

  const payloads: string[] = [popped[1]];

  while (true) {
    const start = performance.now();
    const next = await redis.lpop(queueKey);
    const latencyMs = performance.now() - start;
    ioMs += latencyMs;
    if (next !== null) {
      redisReadLatencySeconds.observe(latencyMs / 1000);
    }
    if (next === null) {
      break;
    }
    payloads.push(next);
  }

  for (const payload of payloads) {
    const parsed = safeJsonParse<ChunkResult>(payload);
    if (!isValidChunkResult(parsed, brand)) {
      await redis.rpush(
        failedKey,
        JSON.stringify({
          brand,
          receivedAt: new Date().toISOString(),
          error: "invalid_chunk_result",
          payload,
        })
      );
      logger.warn({ brand }, "Discarded invalid chunk result payload");
      continue;
    }

    chunks.push(parsed);
  }

  return { chunks, ioMs };
}
