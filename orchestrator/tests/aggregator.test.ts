import { describe, expect, it } from "vitest";

import { aggregateBrandChunks } from "../src/orchestrator/aggregator.js";
import type { ChunkResult } from "../src/orchestrator/types.js";

describe("aggregateBrandChunks", () => {
  const baseChunk: ChunkResult = {
    chunkId: "chunk-1",
    brand: "acme",
    processedAt: new Date().toISOString(),
    sentiment: {
      positive: 3,
      neutral: 2,
      negative: 1,
      score: 2,
    },
    clusters: [
      {
        id: "cluster-a",
        label: "Positive buzz",
        mentions: ["m1", "m2"],
        centroid: [0.9, 0.1],
        sentimentScore: 0.8,
      },
    ],
    topics: ["launch", "growth"],
    summary: "Great launch sentiment",
    spikeDetected: false,
    meta: { mentionCount: 6 },
  };

  it("merges clusters with similar centroids and aggregates sentiment", () => {
    const similarChunk: ChunkResult = {
      ...baseChunk,
      chunkId: "chunk-2",
      sentiment: {
        positive: 1,
        neutral: 3,
        negative: 2,
        score: -1,
      },
      clusters: [
        {
          id: "cluster-b",
          label: "Positive buzz copy",
          mentions: ["m3"],
          centroid: [0.88, 0.12],
          sentimentScore: 0.7,
        },
      ],
      topics: ["launch", "support"],
      summary: "Mixed conversations",
      spikeDetected: true,
      meta: { mentionCount: 5 },
    };

    const aggregated = aggregateBrandChunks("acme", [baseChunk, similarChunk], {
      similarityThreshold: 0.7,
    });

    expect(aggregated.brand).toBe("acme");
    expect(aggregated.totalChunks).toBe(2);
    expect(aggregated.totalMentions).toBe(11);
    expect(aggregated.sentiment).toEqual({
      positive: 4,
      neutral: 5,
      negative: 3,
      score: 1,
    });
    expect(aggregated.spikeDetected).toBe(true);
    expect(aggregated.topics).toEqual(expect.arrayContaining(["launch", "growth", "support"]));
    expect(aggregated.chunkSummaries).toHaveLength(2);
    expect(aggregated.clusters).toHaveLength(1);
    expect(aggregated.clusters[0].mentions).toEqual(expect.arrayContaining(["m1", "m2", "m3"]));
  });

  it("keeps dissimilar clusters separate", () => {
    const distantChunk: ChunkResult = {
      ...baseChunk,
      chunkId: "chunk-3",
      clusters: [
        {
          id: "cluster-c",
          label: "Critical feedback",
          mentions: ["m99"],
          centroid: [0.1, 0.95],
          sentimentScore: -0.5,
          spike: true,
        },
      ],
      meta: { mentionCount: 1 },
    };

    const aggregated = aggregateBrandChunks("acme", [baseChunk, distantChunk], {
      similarityThreshold: 0.9,
    });

    expect(aggregated.clusters).toHaveLength(2);
    const spikeCluster = aggregated.clusters.find((cluster) => cluster.id === "cluster-c");
    expect(spikeCluster?.spike).toBe(true);
  });
});
