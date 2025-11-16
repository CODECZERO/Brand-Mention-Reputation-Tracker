import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";
import { wait } from "../utils/sleep.js";

let client: RedisClientType | null = null;

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && client.isOpen) {
    return client;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      client = createClient({ url: env.redis.url });
      client.on("error", (error) => {
        console.log(`[Redis] Client error on attempt ${attempt}`, error);
        logger.error({ error, attempt }, "Redis client error");
      });

      console.log(`[Redis] Attempting connection (${attempt}/${MAX_ATTEMPTS}) to ${env.redis.url}`);
      await client.connect();
      console.log(`[Redis] Connected on attempt ${attempt}`);
      logger.info({ attempt }, "Connected to Redis");
      return client;
    } catch (error) {
      console.log(`[Redis] Connection attempt ${attempt} failed`, error);
      logger.error({ attempt, error }, "Failed to connect to Redis");

      if (attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      if (client) {
        await client.disconnect().catch(() => undefined);
        client = null;
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await wait(delay);
      console.log(`[Redis] Retrying in ${delay}ms`);
    }
  }

  throw new Error("Unable to establish Redis connection");
}

export async function disconnectRedis(): Promise<void> {
  if (client && client.isOpen) {
    await client.quit();
    client = null;
  }
}
