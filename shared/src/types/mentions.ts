export type MentionSource = "x" | "reddit" | "news" | string;

export interface Mention {
  id: string;
  brand: string;
  source: MentionSource;
  text: string;
  createdAt: string;
  url?: string;
  metadata?: Record<string, unknown>;
  author?: string;
  language?: string;
  sentiment?: "positive" | "neutral" | "negative" | string;
}

export interface MentionBatch {
  brand: string;
  fetchedAt: string;
  mentions: Mention[];
}

export interface ProcessedMentionChunk {
  chunkId: string;
  brand: string;
  createdAt: string;
  clusterLabels: string[];
  spikeScore: number;
  summary: string;
  mentions: Mention[];
  metadata?: Record<string, unknown>;
}
