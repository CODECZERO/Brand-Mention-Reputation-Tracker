import { config as loadEnv } from "dotenv";

loadEnv();

type OptionalString = string | undefined;

function toNumber(value: OptionalString, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringArray(value: OptionalString): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export interface RedisConfig {
  url?: string;
  host: string;
  port: number;
  password?: string;
  username?: string;
  tls?: boolean;
}

export interface AggregatorConfig {
  port: number;
  pollIntervalMs: number;
  concurrency: number;
  xApiKey?: string;
  redditClientId?: string;
  redditClientSecret?: string;
  newsApiKey?: string;
  requestTimeoutMs: number;
}

export interface OrchestratorConfig {
  port: number;
  chunkSize: number;
  maxRetries: number;
  retryDelayMs: number;
  resultTtlSeconds: number;
}

export interface WorkerConfig {
  processingConcurrency: number;
  blockTimeoutSeconds: number;
  port: number;
}

export interface ApiConfig {
  port: number;
  corsOrigin: string | boolean;
}

export interface SharedEnvConfig {
  nodeEnv: string;
  redis: RedisConfig;
  aggregator: AggregatorConfig;
  orchestrator: OrchestratorConfig;
  worker: WorkerConfig;
  api: ApiConfig;
  brands: string[];
  metricsEnabled: boolean;
}

export const env: SharedEnvConfig = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST ?? "localhost",
    port: toNumber(process.env.REDIS_PORT, 6379),
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME,
    tls: process.env.REDIS_TLS === "true",
  },
  aggregator: {
    port: toNumber(process.env.AGGREGATOR_PORT, 4001),
    pollIntervalMs: toNumber(process.env.AGGREGATOR_POLL_INTERVAL_MS, 60_000),
    concurrency: Math.max(1, toNumber(process.env.AGGREGATOR_CONCURRENCY, 3)),
    xApiKey: process.env.X_API_KEY,
    redditClientId: process.env.REDDIT_CLIENT_ID,
    redditClientSecret: process.env.REDDIT_CLIENT_SECRET,
    newsApiKey: process.env.NEWS_API_KEY,
    requestTimeoutMs: toNumber(process.env.AGGREGATOR_REQUEST_TIMEOUT_MS, 10_000),
  },
  orchestrator: {
    port: toNumber(process.env.ORCHESTRATOR_PORT, 4002),
    chunkSize: Math.max(1, toNumber(process.env.ORCHESTRATOR_CHUNK_SIZE, 200)),
    maxRetries: Math.max(0, toNumber(process.env.ORCHESTRATOR_MAX_RETRIES, 3)),
    retryDelayMs: Math.max(0, toNumber(process.env.ORCHESTRATOR_RETRY_DELAY_MS, 5_000)),
    resultTtlSeconds: Math.max(60, toNumber(process.env.ORCHESTRATOR_RESULT_TTL_SECONDS, 3_600)),
  },
  worker: {
    processingConcurrency: Math.max(1, toNumber(process.env.WORKER_CONCURRENCY, 1)),
    blockTimeoutSeconds: Math.max(0, toNumber(process.env.WORKER_BLOCK_TIMEOUT_SECONDS, 0)),
    port: toNumber(process.env.WORKER_PORT, 4003),
  },
  api: {
    port: toNumber(process.env.API_PORT, 3000),
    corsOrigin: process.env.API_CORS_ORIGIN === "*"
      ? true
      : process.env.API_CORS_ORIGIN ?? "http://localhost:5173",
  },
  brands: toStringArray(process.env.BRANDS),
  metricsEnabled: process.env.ENABLE_METRICS === "true",
};

export const isProduction = env.nodeEnv === "production";
