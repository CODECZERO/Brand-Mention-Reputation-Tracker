import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";

loadEnv();

type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace";

interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}

const DEFAULTS = {
  REDIS_URL: process.env.REDIS_URL as string,
  CONCURRENCY_LIMIT: 5,
  HTTP_PORT: 9000,
  PROMETHEUS_PORT: 9001,
  WORKER_STATUS_PORT: 8000,
  MERGE_SIMILARITY_THRESHOLD: 0.75,
  MAX_RETRIES: 3,
  RETRY_BACKOFF_BASE: 2,
  LOG_LEVEL: "info" as LogLevel,
  SCHEDULE_INTERVAL_MS: 30_000,
  CHUNK_FETCH_TIMEOUT_SEC: 30,
  BRAND_LIST_KEY: "brands:set",
  TTL_SUMMARY_SECONDS: 30 * 60,
  NODE_ENV: "development",
};

const warnings: string[] = [];

function warn(message: string): void {
  warnings.push(message);
}

function readString(key: string, fallback: string, { allowEmpty = false }: { allowEmpty?: boolean } = {}): string {
  const raw = process.env[key];
  if (raw === undefined || (!allowEmpty && raw.trim().length === 0)) {
    warn(`${key} is not set; using fallback value.`);
    return fallback;
  }
  return raw;
}

function readUrl(key: string, fallback: string): string {
  const raw = process.env[key];
  if (!raw) {
    warn(`${key} is not set; defaulting to ${fallback}.`);
    return fallback;
  }
  try {
    // eslint-disable-next-line no-new
    new URL(raw);
    return raw;
  } catch {
    warn(`${key} is invalid (${raw}); defaulting to ${fallback}.`);
    return fallback;
  }
}

function readNumber(key: string, fallback: number, options: NumberOptions = {}): number {
  const raw = process.env[key];
  if (raw === undefined) {
    warn(`${key} is not set; using fallback value ${fallback}.`);
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    warn(`${key} must be numeric; received "${raw}". Falling back to ${fallback}.`);
    return fallback;
  }

  if (options.integer && !Number.isInteger(value)) {
    warn(`${key} must be an integer; received ${value}. Falling back to ${fallback}.`);
    return fallback;
  }

  if (options.min !== undefined && value < options.min) {
    warn(`${key} must be >= ${options.min}; received ${value}. Falling back to ${fallback}.`);
    return fallback;
  }

  if (options.max !== undefined && value > options.max) {
    warn(`${key} must be <= ${options.max}; received ${value}. Falling back to ${fallback}.`);
    return fallback;
  }

  return value;
}

function readLogLevel(key: string, fallback: LogLevel): LogLevel {
  const raw = process.env[key];
  if (!raw) {
    warn(`${key} is not set; defaulting to ${fallback}.`);
    return fallback;
  }
  const normalised = raw.toLowerCase() as LogLevel;
  const allowed: ReadonlyArray<LogLevel> = ["fatal", "error", "warn", "info", "debug", "trace"];
  if (!allowed.includes(normalised)) {
    warn(`${key} must be one of ${allowed.join(", ")}; received "${raw}". Falling back to ${fallback}.`);
    return fallback;
  }
  return normalised;
}

const orchestratorId = (() => {
  const raw = process.env.ORCHESTRATOR_ID;
  if (!raw) {
    const fallback = `orchestrator-${randomUUID().slice(0, 8)}`;
    warn(`ORCHESTRATOR_ID is not set; generated fallback ${fallback}.`);
    return fallback;
  }
  return raw;
})();

const scheduleIntervalMsFromEnv = readNumber("SCHEDULE_INTERVAL_MS", DEFAULTS.SCHEDULE_INTERVAL_MS, {
  min: 100,
  integer: true,
});
const orchestratorIntervalSeconds = readNumber("ORCHESTRATOR_INTERVAL", scheduleIntervalMsFromEnv / 1000, {
  min: 1,
});

const scheduleIntervalMs = Number.isFinite(scheduleIntervalMsFromEnv)
  ? scheduleIntervalMsFromEnv
  : Math.round(orchestratorIntervalSeconds * 1000);

const nodeEnv = readString("NODE_ENV", DEFAULTS.NODE_ENV);

if (process.env.BRAND_LIST !== undefined || process.env.BRANDS !== undefined) {
  warn("BRAND_LIST environment variables are deprecated and ignored; ensure brands are registered in Redis.");
}

export interface OrchestratorConfig {
  readonly REDIS_URL: string;
  readonly ORCHESTRATOR_ID: string;
  readonly CONCURRENCY_LIMIT: number;
  readonly HTTP_PORT: number;
  readonly PROMETHEUS_PORT: number;
  readonly WORKER_STATUS_PORT: number;
  readonly MERGE_SIMILARITY_THRESHOLD: number;
  readonly MAX_RETRIES: number;
  readonly RETRY_BACKOFF_BASE: number;
  readonly LOG_LEVEL: LogLevel;
  readonly SCHEDULE_INTERVAL_MS: number;
  readonly CHUNK_FETCH_TIMEOUT_SEC: number;
  readonly BRAND_LIST_KEY: string;
  readonly TTL_SUMMARY_SECONDS: number;
  readonly NODE_ENV: string;
  readonly warnings: readonly string[];
}

export const config: OrchestratorConfig = {
  REDIS_URL: readUrl("REDIS_URL", DEFAULTS.REDIS_URL),
  ORCHESTRATOR_ID: orchestratorId,
  CONCURRENCY_LIMIT: readNumber("CONCURRENCY_LIMIT", DEFAULTS.CONCURRENCY_LIMIT, { integer: true, min: 1 }),
  HTTP_PORT: readNumber("HTTP_PORT", DEFAULTS.HTTP_PORT, { integer: true, min: 1 }),
  PROMETHEUS_PORT: readNumber("PROMETHEUS_PORT", DEFAULTS.PROMETHEUS_PORT, { integer: true, min: 1 }),
  WORKER_STATUS_PORT: readNumber("WORKER_STATUS_PORT", DEFAULTS.WORKER_STATUS_PORT, { integer: true, min: 1 }),
  MERGE_SIMILARITY_THRESHOLD: readNumber("MERGE_SIMILARITY_THRESHOLD", DEFAULTS.MERGE_SIMILARITY_THRESHOLD, {
    min: 0,
    max: 1,
  }),
  MAX_RETRIES: readNumber("MAX_RETRIES", DEFAULTS.MAX_RETRIES, { integer: true, min: 1 }),
  RETRY_BACKOFF_BASE: readNumber("RETRY_BACKOFF_BASE", DEFAULTS.RETRY_BACKOFF_BASE, { min: 0.1 }),
  LOG_LEVEL: readLogLevel("LOG_LEVEL", DEFAULTS.LOG_LEVEL),
  SCHEDULE_INTERVAL_MS: scheduleIntervalMs,
  CHUNK_FETCH_TIMEOUT_SEC: readNumber("CHUNK_FETCH_TIMEOUT_SEC", DEFAULTS.CHUNK_FETCH_TIMEOUT_SEC, {
    integer: true,
    min: 1,
  }),
  BRAND_LIST_KEY: readString("BRAND_LIST_KEY", DEFAULTS.BRAND_LIST_KEY),
  TTL_SUMMARY_SECONDS: readNumber("TTL_SUMMARY_SECONDS", DEFAULTS.TTL_SUMMARY_SECONDS, {
    integer: true,
    min: 60,
  }),
  NODE_ENV: nodeEnv,
  warnings,
};

if (warnings.length > 0) {
  // eslint-disable-next-line no-console
  console.warn("Orchestrator configuration warnings:", warnings);
}
