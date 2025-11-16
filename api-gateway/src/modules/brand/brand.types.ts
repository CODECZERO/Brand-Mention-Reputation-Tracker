export interface MentionMetadata {
  author?: string;
  url?: string;
  [key: string]: unknown;
}

export interface Mention {
  id: string;
  brand: string;
  source: string;
  text: string;
  timestamp: number;
  createdAt: string;
  sentiment: "positive" | "neutral" | "negative";
  metadata?: MentionMetadata;
}

export interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  score: number;
}

export interface ClusterSummary {
  id: string;
  label: string;
  mentions: number;
  spike?: boolean;
}

export interface ChunkResult {
  chunkId: string;
  brand: string;
  processedAt: string;
  sentiment: SentimentBreakdown;
  clusters: ClusterSummary[];
  topics: string[];
  summary?: string;
  spikeDetected?: boolean;
  meta?: Record<string, unknown>;
}

export interface Summary {
  brand: string;
  generatedAt: string;
  totalChunks: number;
  totalMentions: number;
  sentiment: SentimentBreakdown;
  dominantTopics: string[];
  clusters: ClusterSummary[];
  spikeDetected: boolean;
  summary: string;
  chunkSummaries: string[];
}

export interface BrandPayload {
  brand: string;
}

export interface ActiveBrand {
  name: string;
  slug: string;
  createdAt: Date;
}
