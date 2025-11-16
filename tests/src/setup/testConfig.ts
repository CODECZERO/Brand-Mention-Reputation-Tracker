import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { logger } from "@rapidquest/shared";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const DEFAULT_ENV_PATH = path.join(PROJECT_ROOT, ".env");
const TEST_ENV_PATH = path.join(PROJECT_ROOT, "tests/.env.test");

const envPaths = [TEST_ENV_PATH, DEFAULT_ENV_PATH];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: true });
  }
}

if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = "redis://localhost:6379";
  logger.warn("REDIS_URL not provided, using localhost fallback for tests");
}

export const testBrands = (process.env.TEST_BRANDS ?? "acme").split(",").map((brand) => brand.trim()).filter(Boolean);
export const redisUrl = process.env.REDIS_URL;
export const enableMetrics = process.env.ENABLE_PROM_METRICS === "true";
export const alertWebhook = process.env.ALERT_WEBHOOK_URL ?? "";
