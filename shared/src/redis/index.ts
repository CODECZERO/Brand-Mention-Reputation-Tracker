import { createClient } from "redis";
import type { RedisClientType } from "redis";
import { env } from "../config/env.js";
import { logger } from "../logger/index.js";

let client: RedisClientType | undefined;
let connecting = false;

const MAX_CONNECT_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 500;

export function getRedisClient(): RedisClientType {
  if (!client) {
    const socketConfig = env.redis.tls ? { tls: true } : undefined;

    client = createClient(
      env.redis.url
        ? {
            url: env.redis.url,
            socket: socketConfig,
            password: env.redis.password,
            username: env.redis.username,
          }
        : {
            socket: {
              host: env.redis.host,
              port: env.redis.port,
              tls: env.redis.tls ? true : undefined,
            },
            password: env.redis.password,
            username: env.redis.username,
          },
    );

    client.on("error", (error: unknown) => {
      if (error instanceof Error) {
        logger.error("Redis client error", { error: error.message });
        return;
      }
      logger.error("Redis client error", { error });
    });

    client.on("reconnecting", () => {
      logger.warn("Redis client reconnecting");
    });
  }

  return client;
}

export async function connectRedis(): Promise<RedisClientType> {
  const redisClient = getRedisClient();

  if (redisClient.isOpen) {
    return redisClient;
  }

  if (!connecting) {
    connecting = true;
    try {
      await attemptConnectWithRetry(redisClient);
      logger.info("Redis client connected", {
        target: env.redis.url ?? `${env.redis.host}:${env.redis.port}`,
      });
    } finally {
      connecting = false;
    }
  } else {
    // Wait until existing connection attempt finishes
    while (!redisClient.isOpen) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
    logger.info("Redis client connection closed");
  }
}

async function attemptConnectWithRetry(redisClient: RedisClientType): Promise<void> {
  let attempt = 0;
  while (attempt < MAX_CONNECT_RETRIES) {
    try {
      await redisClient.connect();
      return;
    } catch (error) {
      attempt += 1;
      logger.error("Redis connect attempt failed", {
        attempt,
        maxAttempts: MAX_CONNECT_RETRIES,
        error,
      });

      if (attempt >= MAX_CONNECT_RETRIES) {
        throw error;
      }

      const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
      logger.warn("Retrying Redis connection", { attempt: attempt + 1, delayMs: delay });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
