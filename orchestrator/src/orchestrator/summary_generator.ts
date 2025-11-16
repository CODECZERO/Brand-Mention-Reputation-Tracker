import { AggregatedBrandData, BrandSummary } from "./types.js";

export function generateSummary(data: AggregatedBrandData): BrandSummary {
  const { brand, totalChunks, totalMentions, sentiment, topics, clusters, spikeDetected, chunkSummaries } = data;

  const dominantTopics = topics.slice(0, 5);

  const topClusters = clusters
    .slice()
    .sort((a, b) => b.mentions.length - a.mentions.length)
    .slice(0, 5)
    .map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      mentions: cluster.mentions.length,
      spike: cluster.spike,
    }));

  const combinedSummary = buildCombinedSummary({ brand, dominantTopics, spikeDetected, chunkSummaries, topClusters });

  return {
    brand,
    generatedAt: new Date().toISOString(),
    totalChunks,
    totalMentions,
    sentiment,
    dominantTopics,
    clusters: topClusters,
    spikeDetected,
    summary: combinedSummary,
    chunkSummaries,
  };
}

interface SummaryInput {
  brand: string;
  dominantTopics: string[];
  spikeDetected: boolean;
  chunkSummaries: string[];
  topClusters: Array<{ id: string; label: string; mentions: number; spike?: boolean }>;
}

function buildCombinedSummary({ brand, dominantTopics, spikeDetected, chunkSummaries, topClusters }: SummaryInput): string {
  const lines: string[] = [];

  lines.push(`Brand ${brand} currently has ${topClusters.reduce((acc, cluster) => acc + cluster.mentions, 0)} notable mentions.`);

  if (dominantTopics.length > 0) {
    lines.push(`Key topics: ${dominantTopics.join(", ")}.`);
  }

  if (spikeDetected) {
    const spikingClusters = topClusters.filter((cluster) => cluster.spike);
    if (spikingClusters.length > 0) {
      lines.push(
        `Spike detected in clusters: ${spikingClusters
          .map((cluster) => `${cluster.label} (${cluster.mentions} mentions)`)
          .join(", ")}.`
      );
    } else {
      lines.push("Overall spike detected across mentions.");
    }
  }

  if (chunkSummaries.length > 0) {
    lines.push("Highlights:");
    chunkSummaries.slice(0, 3).forEach((summary, index) => {
      lines.push(`${index + 1}. ${summary}`);
    });
  }

  return lines.join(" ");
}
