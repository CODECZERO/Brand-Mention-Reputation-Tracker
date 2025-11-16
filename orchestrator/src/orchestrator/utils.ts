import { performance } from "node:perf_hooks";
import { config } from "./config.js";

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function buildBrandListKey(): string {
  return config.BRAND_LIST_KEY;
}

export function buildResultKey(brand: string): string {
  return `result:brand:${brand}:chunks`;
}

export function buildSummaryKey(brand: string): string {
  return `summary:brand:${brand}`;
}

export function buildFailedKey(brand: string): string {
  return `failed:brand:${brand}`;
}

export interface TimedResult<T> {
  result: T;
  durationMs: number;
}

export async function measureAsync<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function sleep(seconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export async function exponentialBackoff<T>(
  operation: () => Promise<T>,
  options: { retries?: number; baseDelaySeconds?: number } = {}
): Promise<T> {
  const { retries = config.MAX_RETRIES, baseDelaySeconds = config.RETRY_BACKOFF_BASE } = options;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt > retries) {
        throw error;
      }
      const delay = baseDelaySeconds * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }
}
