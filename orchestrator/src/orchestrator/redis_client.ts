import Redis from "ioredis";
import type { Redis as RedisClient } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

let client: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (!client) {
    const redis = new (Redis as unknown as { new (...args: any[]): RedisClient })(config.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });

    redis.on("connect", () => {
      console.log("[orchestrator] Redis connection established");
      logger.info({ event: "redis_connect" }, "Redis connection established");
    });
    redis.on("error", (error: Error) => {
      console.error("[orchestrator] Redis client error", error);
      logger.error({ error, event: "redis_error" }, "Redis client error");
    });
    redis.on("close", () => {
      console.warn("[orchestrator] Redis connection closed");
      logger.warn({ event: "redis_close" }, "Redis connection closed");
    });

    client = redis;
  }

  return client!;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }

  const redis = client;
  client = null;

  try {
    await redis.quit();
  } catch (error) {
    logger.warn({ error, event: "redis_quit_error" }, "Error quitting Redis connection");
  }
  redis.removeAllListeners();
}
