export interface CreateBrandRequest {
  brandName: string;
  keywords: string[];
}

export interface CreateBrandResponse {
  name: string;
  slug: string;
}

export interface BrandRecord {
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
  keywords?: string[];
}

export type BrandListResponse = BrandRecord[];
export type BrandDetailResponse = BrandRecord;

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

export type LiveMentionsResponse = Mention[];

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

export interface BrandSummaryResponse {
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

export interface SpikeSample {
  timestamp: string;
  spikeScore: number;
  mentionCount: number;
  threshold: number;
}

export interface BrandSpikesResponse {
  timeline: SpikeSample[];
  last24hCount: number;
  brand?: string;
  redisLatencySeconds?: number;
}

export interface SentimentTrendPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface BrandAnalyticsResponse {
  sentimentTrend: SentimentTrendPoint[];
  spikeTimeline: SpikeSample[];
  topics: { term: string; weight: number }[];
}

export interface DeleteBrandResponse {
  success: boolean;
}

