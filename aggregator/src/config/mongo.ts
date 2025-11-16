import { MongoClient, type Db } from "mongodb";
import { env } from "./env.js";
import { wait } from "../utils/sleep.js";
import { logger } from "../utils/logger.js";

let client: MongoClient | null = null;
let database: Db | null = null;

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 500;

function resolveDatabaseName(connectionUrl: string): string | undefined {
  try {
    const parsed = new URL(connectionUrl);
    const pathname = parsed.pathname?.replace(/^\//, "");
    return pathname || undefined;
  } catch (error) {
    logger.warn({ error }, "Unable to parse Mongo connection URL for database name");
    return undefined;
  }
}

export async function connectMongo(): Promise<Db> {
  if (database) {
    return database;
  }

  const dbName = resolveDatabaseName(env.mongo.url);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      if (!client) {
        client = new MongoClient(env.mongo.url);
      }

      console.log(`[Mongo] Attempting connection (${attempt}/${MAX_ATTEMPTS}) to ${env.mongo.url}`);
      await client.connect();
      database = dbName ? client.db(dbName) : client.db();

      console.log(`[Mongo] Connected on attempt ${attempt}`);
      logger.info({ attempt, dbName }, "Connected to MongoDB");

      return database;
    } catch (error) {
      console.log(`[Mongo] Connection attempt ${attempt} failed`, error);
      logger.error({ attempt, error }, "Failed to connect to MongoDB");

      if (attempt >= MAX_ATTEMPTS) {
        throw error;
      }

      if (client) {
        await client.close().catch(() => undefined);
        client = null;
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      await wait(delay);
    }
  }

  throw new Error("Unable to establish MongoDB connection");
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}
