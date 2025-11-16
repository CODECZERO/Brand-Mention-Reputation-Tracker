process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

import type { Redis } from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchChunkResults } from "../src/orchestrator/result_collector.js";
import type { ChunkResult } from "../src/orchestrator/types.js";

type RedisMock = {
  blpop: ReturnType<typeof vi.fn<[string, number?], Promise<[string, string] | null>>>;
  lpop: ReturnType<typeof vi.fn<[string], Promise<string | null>>>;
  rpush: ReturnType<typeof vi.fn<[string, ...string[]], Promise<number>>>;
};

function createRedisMock(): RedisMock {
  return {
    blpop: vi.fn(),
    lpop: vi.fn(),
    rpush: vi.fn(),
  };
}

const baseChunk: ChunkResult = {
  chunkId: "chunk-1",
  brand: "acme",
  processedAt: new Date().toISOString(),
  sentiment: {
    positive: 2,
    neutral: 1,
    negative: 0,
    score: 2,
  },
  clusters: [
    {
      id: "cluster-a",
      label: "Launch buzz",
      mentions: ["m1"],
      centroid: [0.1, 0.9],
      sentimentScore: 0.8,
    },
  ],
  topics: ["launch"],
  summary: "Strong positive response",
  spikeDetected: false,
  meta: { mentionCount: 3 },
};

describe("fetchChunkResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects all available chunk payloads from Redis", async () => {
    const redis = createRedisMock();
    const secondChunk: ChunkResult = {
      ...baseChunk,
      chunkId: "chunk-2",
      meta: { mentionCount: 4 },
    };

    redis.blpop.mockResolvedValueOnce([
      "result:brand:acme:chunks",
      JSON.stringify(baseChunk),
    ]);
    redis.lpop.mockResolvedValueOnce(JSON.stringify(secondChunk));
    redis.lpop.mockResolvedValueOnce(null);

    const { chunks, ioMs } = await fetchChunkResults(redis as unknown as Redis, "acme");

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.chunkId)).toEqual(["chunk-1", "chunk-2"]);
    expect(redis.rpush).not.toHaveBeenCalled();
    expect(typeof ioMs).toBe("number");
  });

  it("parks invalid payloads into the failed queue", async () => {
    const redis = createRedisMock();

    redis.blpop.mockResolvedValueOnce([
      "result:brand:acme:chunks",
      JSON.stringify({ ...baseChunk, brand: "wrong" }),
    ]);
    redis.lpop.mockResolvedValueOnce(null);

    const { chunks } = await fetchChunkResults(redis as unknown as Redis, "acme");

    expect(chunks).toHaveLength(0);
    expect(redis.rpush).toHaveBeenCalledTimes(1);
    const [failedKey, payload] = redis.rpush.mock.calls[0];
    expect(failedKey).toBe("failed:brand:acme");
    expect(JSON.parse(payload as string)).toMatchObject({
      brand: "acme",
      error: "invalid_chunk_result",
    });
  });

  it("returns immediately when no chunks are available", async () => {
    const redis = createRedisMock();
    redis.blpop.mockResolvedValueOnce(null);

    const { chunks, ioMs } = await fetchChunkResults(redis as unknown as Redis, "acme");

    expect(chunks).toHaveLength(0);
    expect(ioMs).toBeGreaterThanOrEqual(0);
    expect(redis.lpop).not.toHaveBeenCalled();
  });
});
