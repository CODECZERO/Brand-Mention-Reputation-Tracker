export interface MentionCluster {
  id: string;
  label: string;
  mentions: string[];
  centroid?: number[];
  sentimentScore?: number;
  spike?: boolean;
}

export interface ChunkResult {
  chunkId: string;
  brand: string;
  processedAt: string;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    score: number;
  };
  clusters: MentionCluster[];
  topics: string[];
  summary?: string;
  spikeDetected?: boolean;
  meta?: Record<string, unknown>;
}

export interface AggregatedBrandData {
  brand: string;
  totalChunks: number;
  totalMentions: number;
  sentiment: ChunkResult["sentiment"];
  topics: string[];
  clusters: MentionCluster[];
  spikeDetected: boolean;
  chunkSummaries: string[];
}

export interface BrandSummary {
  brand: string;
  generatedAt: string;
  totalChunks: number;
  totalMentions: number;
  sentiment: ChunkResult["sentiment"];
  dominantTopics: string[];
  clusters: Array<{ id: string; label: string; mentions: number; spike?: boolean }>;
  spikeDetected: boolean;
  summary: string;
  chunkSummaries: string[];
}

export interface TimingBreakdown {
  ioMs: number;
  mergeMs: number;
  summaryMs: number;
  totalMs: number;
}
