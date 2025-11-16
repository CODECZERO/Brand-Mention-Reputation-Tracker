import { beforeAll, afterAll, beforeEach } from "vitest";
import { RedisContainer } from "testcontainers";
import { createClient, type RedisClientType } from "redis";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

interface TestRedisContext {
  container: RedisContainer;
  url: string;
  client: RedisClientType;
}

declare global {
  // eslint-disable-next-line no-var
  var __TEST_REDIS__: TestRedisContext | undefined;
}

const TEST_ENV_PATH = path.resolve(process.cwd(), "tests/.env.test");

if (fs.existsSync(TEST_ENV_PATH)) {
  dotenv.config({ path: TEST_ENV_PATH, override: true });
}

beforeAll(async () => {
  if (!global.__TEST_REDIS__) {
    const container = await new RedisContainer("redis:7-alpine")
      .withExposedPorts({ container: 6379, host: 0 })
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(6379);
    const url = `redis://${host}:${port}`;

    process.env.REDIS_URL = url;
    process.env.REDIS_HOST = host;
    process.env.REDIS_PORT = String(port);
    process.env.REDIS_TLS = "false";
    process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

    const client = createClient({ url });
    await client.connect();

    global.__TEST_REDIS__ = { container, url, client };
  }
});

beforeEach(async () => {
  if (!global.__TEST_REDIS__) {
    throw new Error("Test Redis container not initialized");
  }

  const { client } = global.__TEST_REDIS__;
  await client.flushAll();
});

afterAll(async () => {
  if (!global.__TEST_REDIS__) {
    return;
  }

  const { client, container } = global.__TEST_REDIS__;
  await client.quit();
  await container.stop({ timeout: 10_000 });
  global.__TEST_REDIS__ = undefined;
});
