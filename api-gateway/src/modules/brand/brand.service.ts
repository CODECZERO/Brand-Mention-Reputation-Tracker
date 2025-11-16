import { redis } from "../../utils/redis";
import { ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import { findCurrentBrand, replaceCurrentBrand, type BrandRecord } from "./brand.repository";
import { toSlug } from "./brand.helpers";
import type { Mention, ChunkResult, Summary } from "./brand.types";

export interface LiveMentionsResult {
  mentions: Mention[];
  brand: string;
  redisLatencySeconds: number;
}

export interface ChunkResultsResult {
  chunks: ChunkResult[];
  brand: string;
  redisLatencySeconds: number;
}

export interface SummaryResult {
  summary: Summary | null;
  brand: string;
  redisLatencySeconds: number;
}

export interface AnalyticsPayload {
  sentimentTrend: Array<{ date: string; positive: number; neutral: number; negative: number }>;
  spikeTimeline: Array<{ timestamp: string; spikeScore: number; mentionCount: number; threshold: number }>;
  topics: Array<{ term: string; weight: number }>;
}

export interface SpikeSample {
  timestamp: string;
  spikeScore: number;
  mentionCount: number;
  threshold: number;
}

export interface SpikesResult {
  timeline: SpikeSample[];
  last24hCount: number;
  brand: string;
  redisLatencySeconds: number;
}

export interface BrandEntity {
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function getCurrentBrand(): Promise<BrandEntity | null> {
  const record = await findCurrentBrand();
  if (!record) {
    return null;
  }

  return normalizeBrandRecord(record);
}

export async function setCurrentBrand(rawName: string): Promise<BrandEntity> {
  const name = rawName?.trim();
  if (!name) {
    throw new ValidationError("brand is required", 400);
  }

  const slug = toSlug(name);
  if (!slug) {
    throw new ValidationError("brand is required", 400);
  }

  const created = await replaceCurrentBrand(name, slug);
  logger.info({ event: "brand_set", brand: slug });
  return normalizeBrandRecord(created);
}

export async function fetchLiveMentions(brandParam: string): Promise<LiveMentionsResult> {
  const slug = normalizeBrandParam(brandParam);
  const keys = buildLast24HourKeys(slug);
  const mentionsKey = buildMentionsKey(slug);
  const uniqueKeys = [...new Set([...keys, mentionsKey])];

  const results = await Promise.all(uniqueKeys.map((key) => redis.getList<Mention>(key)));

  const totalLatency = results.reduce((acc, item) => acc + item.latencySeconds, 0);
  const mentions = results.flatMap((item) => item.data);

  const filtered = mentions
    .map((mention) => sanitizeMention(mention))
    .filter((mention): mention is Mention => mention !== null)
    .sort((a, b) => b.timestamp - a.timestamp);

  return {
    mentions: filtered,
    brand: slug,
    redisLatencySeconds: totalLatency,
  };
}

export async function fetchChunkResults(brandParam: string): Promise<ChunkResultsResult> {
  const slug = normalizeBrandParam(brandParam);
  const key = buildChunkKey(slug);

  const { data, latencySeconds } = await redis.getList<ChunkResult>(key);

  return {
    chunks: data.map((chunk) => sanitizeChunk(chunk)).filter((chunk): chunk is ChunkResult => chunk !== null),
    brand: slug,
    redisLatencySeconds: latencySeconds,
  };
}

export async function fetchSummary(brandParam: string): Promise<SummaryResult> {
  const slug = normalizeBrandParam(brandParam);
  const key = buildSummaryKey(slug);

  const { data, latencySeconds } = await redis.getJSON<Summary>(key);

  return {
    summary: sanitizeSummary(data),
    brand: slug,
    redisLatencySeconds: latencySeconds,
  };
}

export async function fetchAnalytics(brandParam: string): Promise<{ analytics: AnalyticsPayload | null; brand: string; redisLatencySeconds: number }> {
  const slug = normalizeBrandParam(brandParam);
  const summaryKey = buildSummaryKey(slug);
  const spikesKey = buildSpikesKey(slug);

  const [summaryRaw, spikesRaw] = await Promise.all([
    redis.getJSON<Summary>(summaryKey),
    redis.getList<{ timestamp: string; spikeScore: number; mentionCount: number; threshold: number }>(spikesKey),
  ]);

  const summary = sanitizeSummary(summaryRaw.data);
  const spikeTimeline = Array.isArray(spikesRaw.data)
    ? spikesRaw.data.map((entry) => ({
        timestamp: String(entry.timestamp ?? new Date().toISOString()),
        spikeScore: Number(entry.spikeScore ?? 0),
        mentionCount: Number(entry.mentionCount ?? 0),
        threshold: Number(entry.threshold ?? 0),
      }))
    : [];

  if (!summary) {
    return {
      analytics: null,
      brand: slug,
      redisLatencySeconds: summaryRaw.latencySeconds + spikesRaw.latencySeconds,
    };
  }

  const sentimentTrend = buildSentimentTrend(summary);
  const topics = summary.dominantTopics.map((term) => ({ term, weight: 1 / Math.max(summary.dominantTopics.length, 1) }));

  return {
    analytics: {
      sentimentTrend,
      spikeTimeline,
      topics,
    },
    brand: slug,
    redisLatencySeconds: summaryRaw.latencySeconds + spikesRaw.latencySeconds,
  };
}

export async function fetchSpikes(brandParam: string): Promise<SpikesResult> {
  const slug = normalizeBrandParam(brandParam);
  const spikesKey = buildSpikesKey(slug);

  const { data, latencySeconds } = await redis.getList<SpikeSample>(spikesKey);
  const timeline = data
    .map((entry) => sanitizeSpikeEntry(entry))
    .filter((entry): entry is SpikeSample => entry !== null)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24hCount = timeline.filter((entry) => {
    const parsed = Date.parse(entry.timestamp);
    return Number.isFinite(parsed) && parsed >= twentyFourHoursAgo;
  }).length;

  return {
    timeline,
    last24hCount,
    brand: slug,
    redisLatencySeconds: latencySeconds,
  };
}

function normalizeBrandParam(brand: string): string {
  if (!brand || typeof brand !== "string") {
    throw new ValidationError("brand parameter is required", 400);
  }

  const slug = toSlug(brand.trim());
  if (!slug) {
    throw new ValidationError("brand parameter is required", 400);
  }
  return slug;
}

function buildLast24HourKeys(brand: string): string[] {
  const now = new Date();
  const keys = new Set<string>();

  for (let i = 0; i < 24; i += 1) {
    const date = new Date(now.getTime() - i * 60 * 60 * 1000);
    const day = formatDate(date);
    const hour = date.getUTCHours().toString().padStart(2, "0");

    keys.add(`data:brand:${brand}:${day}:${hour}`);
    keys.add(`data:${brand}:${day}:${hour}`);
  }

  return [...keys];
}

function buildChunkKey(brand: string): string {
  return `result:brand:${brand}:chunks`;
}

function buildMentionsKey(brand: string): string {
  return `data:brand:${brand}:mentions`;
}

function buildSummaryKey(brand: string): string {
  return `summary:brand:${brand}`;
}

function buildSpikesKey(brand: string): string {
  return `spike:brand:${brand}`;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sanitizeMention(payload: Mention | null | undefined): Mention | null {
  if (!payload) {
    return null;
  }

  try {
    const timestamp = normalizeTimestamp(payload.timestamp);
    return {
      id: String(payload.id),
      brand: String(payload.brand ?? ""),
      source: String((payload as any).source ?? (payload as any).platform ?? ""),
      text: String((payload as any).text ?? ""),
      timestamp,
      createdAt: new Date(timestamp).toISOString(),
      sentiment: normalizeSentiment((payload as any).sentiment),
      metadata: normalizeMetadata(payload),
    } satisfies Mention;
  } catch (error) {
    logger.error({ event: "sanitize_mention_error", error, payload });
    return null;
  }
}

function normalizeTimestamp(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string") {
    const numeric = Number(raw);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function normalizeSentiment(raw: unknown): "positive" | "neutral" | "negative" {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    if (lower === "positive" || lower === "neutral" || lower === "negative") {
      return lower;
    }
  }
  return "neutral";
}

function normalizeMetadata(payload: any): Record<string, unknown> | undefined {
  const metadata = payload?.metadata ?? {};
  const extended: Record<string, unknown> = {
    ...metadata,
  };
  if (!extended.author && typeof payload?.metadata?.author === "string") {
    extended.author = payload.metadata.author;
  }
  if (!extended.url && typeof payload?.metadata?.url === "string") {
    extended.url = payload.metadata.url;
  }
  return Object.keys(extended).length > 0 ? extended : undefined;
}

function sanitizeChunk(payload: ChunkResult | null | undefined): ChunkResult | null {
  if (!payload) {
    return null;
  }

  try {
    const sentiment = payload.sentiment ?? {};
    return {
      chunkId: String(payload.chunkId),
      brand: String(payload.brand ?? ""),
      processedAt: new Date(payload.processedAt ?? Date.now()).toISOString(),
      sentiment: {
        positive: coerceNumber(sentiment.positive),
        neutral: coerceNumber(sentiment.neutral),
        negative: coerceNumber(sentiment.negative),
        score: coerceNumber(sentiment.score),
      },
      clusters: Array.isArray(payload.clusters)
        ? payload.clusters.map((cluster) => ({
            id: String(cluster.id ?? ""),
            label: String(cluster.label ?? ""),
            mentions: Number(cluster.mentions ?? 0),
            spike: Boolean(cluster.spike),
          }))
        : [],
      topics: Array.isArray(payload.topics) ? payload.topics.map((topic) => String(topic)) : [],
      summary: typeof payload.summary === "string" ? payload.summary : undefined,
      spikeDetected: Boolean(payload.spikeDetected),
      meta: typeof payload.meta === "object" && payload.meta !== null ? payload.meta : undefined,
    } satisfies ChunkResult;
  } catch (error) {
    logger.error({ event: "sanitize_chunk_error", error, payload });
    return null;
  }
}

function sanitizeSummary(payload: Summary | null): Summary | null {
  if (!payload) {
    return null;
  }

  try {
    const sentiment = payload.sentiment ?? {};
    return {
      brand: String(payload.brand ?? ""),
      generatedAt: new Date(payload.generatedAt ?? Date.now()).toISOString(),
      totalChunks: Number(payload.totalChunks ?? 0),
      totalMentions: Number(payload.totalMentions ?? 0),
      sentiment: {
        positive: coerceNumber(sentiment.positive),
        neutral: coerceNumber(sentiment.neutral),
        negative: coerceNumber(sentiment.negative),
        score: coerceNumber(sentiment.score),
      },
      dominantTopics: Array.isArray(payload.dominantTopics) ? payload.dominantTopics.map((topic) => String(topic)) : [],
      clusters: Array.isArray(payload.clusters)
        ? payload.clusters.map((cluster) => ({
            id: String(cluster.id ?? ""),
            label: String(cluster.label ?? ""),
            mentions: Number(cluster.mentions ?? 0),
            spike: Boolean(cluster.spike),
          }))
        : [],
      spikeDetected: Boolean(payload.spikeDetected),
      summary: String(payload.summary ?? ""),
      chunkSummaries: Array.isArray(payload.chunkSummaries)
        ? payload.chunkSummaries.map((item) => String(item))
        : [],
    } satisfies Summary;
  } catch (error) {
    logger.error({ event: "sanitize_summary_error", error, payload });
    return null;
  }
}

function buildSentimentTrend(summary: Summary): Array<{ date: string; positive: number; neutral: number; negative: number }> {
  const today = new Date(summary.generatedAt ?? Date.now());
  const trend: Array<{ date: string; positive: number; neutral: number; negative: number }> = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    trend.push({
      date: date.toISOString().slice(0, 10),
      positive: summary.sentiment.positive,
      neutral: summary.sentiment.neutral,
      negative: summary.sentiment.negative,
    });
  }
  return trend;
}

function coerceNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeBrandRecord(record: BrandRecord): BrandEntity {
  return {
    name: record.name,
    slug: record.slug,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  } satisfies BrandEntity;
}

function sanitizeSpikeEntry(payload: unknown): SpikeSample | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Partial<Record<string, unknown>>;
  const timestampRaw = candidate.timestamp;
  const timestamp = typeof timestampRaw === "string" && timestampRaw.trim().length > 0
    ? new Date(timestampRaw)
    : new Date();
  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }

  return {
    timestamp: timestamp.toISOString(),
    spikeScore: coerceNumber(candidate.spikeScore),
    mentionCount: coerceNumber(candidate.mentionCount),
    threshold: coerceNumber(candidate.threshold),
  };
}
