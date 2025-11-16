import { createClient, type RedisClientType } from "redis";
import { env } from "../config/env";
import { logger } from "./logger";
import { redisLatencySeconds } from "./metrics";
import { RedisUnavailableError } from "./errors";

let client: RedisClientType | null = null;
let connecting = false;

export async function connectRedis(): Promise<RedisClientType> {
  if (client) {
    return client;
  }

  if (connecting) {
    return waitForClient();
  }

  connecting = true;

  try {
    client = createClient({ url: env.redisUrl });

    client.on("error", (error: unknown) => {
      logger.error({ event: "redis_error", error });
    });

    client.on("reconnecting", () => {
      logger.warn({ event: "redis_reconnecting" });
    });

    await client.connect();
    logger.info({ event: "redis_connected", url: env.redisUrl });
    return client;
  } catch (error) {
    client = null;
    logger.error({ event: "redis_connection_error", error });
    throw new RedisUnavailableError();
  } finally {
    connecting = false;
  }
}

async function waitForClient(): Promise<RedisClientType> {
  let attempts = 0;
  while (!client) {
    if (!connecting) {
      throw new RedisUnavailableError();
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    attempts += 1;
    if (attempts > 200) {
      throw new RedisUnavailableError();
    }
  }
  return client;
}

function secondsSince(start: bigint): number {
  const diffNs = process.hrtime.bigint() - start;
  return Number(diffNs) / 1_000_000_000;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.quit();
    logger.info({ event: "redis_disconnected" });
  } catch (error) {
    logger.error({ event: "redis_disconnect_error", error });
  } finally {
    client = null;
  }
}

async function executeRedis<T>(operation: string, action: (redisClient: RedisClientType) => Promise<T>): Promise<{
  data: T;
  latencySeconds: number;
}> {
  try {
    const redisClient = client ?? (await connectRedis());
    const startedAt = process.hrtime.bigint();
    try {
      const data = await action(redisClient);
      const latencySeconds = secondsSince(startedAt);
      redisLatencySeconds.observe({ operation }, latencySeconds);
      return { data, latencySeconds };
    } catch (error) {
      const latencySeconds = secondsSince(startedAt);
      redisLatencySeconds.observe({ operation }, latencySeconds);
      logger.error({ event: "redis_operation_error", operation, error });
      throw new RedisUnavailableError();
    }
  } catch (error) {
    if (error instanceof RedisUnavailableError) {
      throw error;
    }
    logger.error({ event: "redis_execute_error", operation, error });
    throw new RedisUnavailableError();
  }
}

export interface RedisJSONResult<T> {
  data: T | null;
  latencySeconds: number;
}

export interface RedisListResult<T> {
  data: T[];
  latencySeconds: number;
}

export interface RedisScanResult {
  keys: string[];
  latencySeconds: number;
}

export async function getJSON<T>(key: string): Promise<RedisJSONResult<T>> {
  const { data, latencySeconds } = await executeRedis(`get:${key}`, (redisClient) => redisClient.get(key));

  if (!data) {
    return { data: null, latencySeconds };
  }

  try {
    const parsed = JSON.parse(data) as T;
    return { data: parsed, latencySeconds };
  } catch (error) {
    logger.error({ event: "redis_json_parse_error", key, error });
    return { data: null, latencySeconds };
  }
}

export async function getList<T>(key: string): Promise<RedisListResult<T>> {
  const { data, latencySeconds } = await executeRedis(`lrange:${key}`, (redisClient) =>
    redisClient.lRange(key, 0, -1),
  );

  const items: T[] = [];

  for (const entry of data) {
    try {
      const parsed = JSON.parse(entry) as T;
      items.push(parsed);
    } catch (error) {
      logger.error({ event: "redis_list_parse_error", key, error });
    }
  }

  return { data: items, latencySeconds };
}

export async function scanKeys(pattern: string): Promise<RedisScanResult> {
  const { data, latencySeconds } = await executeRedis(`scan:${pattern}`, async (redisClient) => {
    const keys: string[] = [];
    for await (const key of redisClient.scanIterator({ MATCH: pattern })) {
      keys.push(key);
    }
    return keys;
  });

  return { keys: data, latencySeconds };
}

export const redis = {
  connect: connectRedis,
  disconnect: disconnectRedis,
  getJSON,
  getList,
  scanKeys,
};
