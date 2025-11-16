import { config } from "./config.js";
import { ChunkResult, MentionCluster, AggregatedBrandData } from "./types.js";
import { cosineSimilarity } from "./utils.js";

interface MergeOptions {
  similarityThreshold?: number;
}

function hasCentroid(cluster: MentionCluster): cluster is MentionCluster & { centroid: number[] } {
  return Array.isArray(cluster.centroid) && cluster.centroid.length > 0;
}

function mergeClusters(clusters: MentionCluster[], threshold: number): MentionCluster[] {
  const merged: MentionCluster[] = [];

  clusters.forEach((cluster) => {
    if (!hasCentroid(cluster)) {
      merged.push({ ...cluster });
      return;
    }

    const clusterCentroid = cluster.centroid;

    const match = merged.find((existing) => {
      if (!hasCentroid(existing)) return false;
      return cosineSimilarity(existing.centroid, clusterCentroid) >= threshold;
    });

    if (match) {
      const combinedMentions = new Set([...match.mentions, ...cluster.mentions]);
      match.mentions = Array.from(combinedMentions);
      match.sentimentScore = ((match.sentimentScore ?? 0) + (cluster.sentimentScore ?? 0)) / 2;
      match.spike = Boolean(match.spike || cluster.spike);
    } else {
      merged.push({ ...cluster });
    }
  });

  return merged;
}

export function aggregateBrandChunks(
  brand: string,
  chunks: ChunkResult[],
  options: MergeOptions = {}
): AggregatedBrandData {
  const threshold = options.similarityThreshold ?? config.MERGE_SIMILARITY_THRESHOLD;

  const sentiment = {
    positive: 0,
    neutral: 0,
    negative: 0,
    score: 0,
  };

  const topics = new Set<string>();
  let spikeDetected = false;
  const summaries: string[] = [];
  let totalMentions = 0;

  const mergedClusters = mergeClusters(
    chunks.flatMap((chunk) => chunk.clusters ?? []),
    threshold
  );

  chunks.forEach((chunk) => {
    sentiment.positive += chunk.sentiment.positive;
    sentiment.neutral += chunk.sentiment.neutral;
    sentiment.negative += chunk.sentiment.negative;
    sentiment.score += chunk.sentiment.score;
    chunk.topics.forEach((topic) => topics.add(topic));
    spikeDetected = spikeDetected || Boolean(chunk.spikeDetected);
    if (chunk.summary) summaries.push(chunk.summary);

    if (chunk.meta && typeof chunk.meta.mentionCount === "number") {
      totalMentions += chunk.meta.mentionCount;
    } else {
      totalMentions += chunk.clusters.reduce((acc, cluster) => acc + cluster.mentions.length, 0);
    }
  });

  return {
    brand,
    totalChunks: chunks.length,
    totalMentions,
    sentiment,
    topics: Array.from(topics),
    clusters: mergedClusters,
    spikeDetected,
    chunkSummaries: summaries,
  };
}
