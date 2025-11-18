import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv-safe";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);

const envPath = path.resolve(currentDir, "../../.env");
const examplePath = path.resolve(currentDir, "../../.env.example");

type LoadEnvOptions = NonNullable<Parameters<typeof loadEnv>[0]>;

const loadOptions: LoadEnvOptions = {
  allowEmptyValues: true,
};

if (fs.existsSync(envPath)) {
  loadOptions.path = envPath;
}

if (fs.existsSync(examplePath)) {
  loadOptions.example = examplePath;
}

loadEnv(loadOptions);

interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

const requireEnv = (key: string): string => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim().length === 0) {
    throw new Error(`[config] Missing required environment variable ${key}`);
  }
  return raw;
};

const toNumber = (key: string, options: NumberOptions = {}): number => {
  const value = Number(requireEnv(key));
  if (!Number.isFinite(value)) {
    throw new Error(`[config] Environment variable ${key} must be numeric`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`[config] Environment variable ${key} must be an integer`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`[config] Environment variable ${key} must be >= ${options.min}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`[config] Environment variable ${key} must be <= ${options.max}`);
  }
  return value;
};

const toBoolean = (key: string): boolean => {
  const raw = requireEnv(key).trim().toLowerCase();
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`[config] Environment variable ${key} must be either "true" or "false"`);
};

export interface RateLimitConfig {
  maxRequests: number;
  intervalMs: number;
}

export interface AggregatorConfig {
  port: number;
  intervalMs: number;
  requestTimeoutMs: number;
  requestMaxRetries: number;
  requestRetryBackoffMs: number;
  maxFetchLimit: number;
  redisTtlSeconds: number;
  metricsEnabled: boolean;
  rateLimit: RateLimitConfig;
  chunkSize: number;
}

export interface RedisConfig {
  url: string;
}

export interface MongoConfig {
  url: string;
}

export interface RedditConfig {
  apiUrl: string;
}

export interface NewsApiConfig {
  apiKey: string;
  apiUrl: string;
}

export interface XConfig {
  apiKey: string;
}

export interface LoggerConfig {
  level: string;
}

export interface EnvConfig {
  nodeEnv: string;
  aggregator: AggregatorConfig;
  redis: RedisConfig;
  mongo: MongoConfig;
  reddit: RedditConfig;
  newsApi: NewsApiConfig;
  x: XConfig;
  logger: LoggerConfig;
}

export const env: EnvConfig = {
  nodeEnv: requireEnv("NODE_ENV"),
  aggregator: {
    port: toNumber("AGGREGATOR_PORT", { integer: true, min: 1 }),
    intervalMs: toNumber("AGGREGATOR_INTERVAL_MS", { integer: true, min: 1 }),
    requestTimeoutMs: toNumber("AGGREGATOR_REQUEST_TIMEOUT_MS", { integer: true, min: 1 }),
    requestMaxRetries: toNumber("AGGREGATOR_REQUEST_MAX_RETRIES", { integer: true, min: 1 }),
    requestRetryBackoffMs: toNumber("AGGREGATOR_REQUEST_RETRY_BACKOFF_MS", { min: 0 }),
    maxFetchLimit: toNumber("AGGREGATOR_MAX_FETCH_LIMIT", { integer: true, min: 1 }),
    redisTtlSeconds: toNumber("AGGREGATOR_REDIS_TTL_SECONDS", { integer: true, min: 1 }),
    metricsEnabled: toBoolean("AGGREGATOR_METRICS_ENABLED"),
    rateLimit: {
      maxRequests: toNumber("AGGREGATOR_RATE_LIMIT_MAX_REQUESTS", { integer: true, min: 1 }),
      intervalMs: toNumber("AGGREGATOR_RATE_LIMIT_INTERVAL_MS", { integer: true, min: 1 }),
    },
    chunkSize: toNumber("AGGREGATOR_CHUNK_SIZE", { integer: true, min: 1 }),
  },
  redis: {
    url: requireEnv("REDIS_URL"),
  },
  mongo: {
    url: requireEnv("MONGO_URL"),
  },
  reddit: {
    apiUrl: requireEnv("REDDIT_API_URL"),
  },
  newsApi: {
    apiKey: requireEnv("NEWS_API_KEY"),
    apiUrl: requireEnv("NEWS_API_URL"),
  },
  x: {
    apiKey: requireEnv("X_API_KEY"),
  },
  logger: {
    level: requireEnv("LOG_LEVEL"),
  },
};
