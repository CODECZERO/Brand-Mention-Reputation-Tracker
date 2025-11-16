import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

mongoose.set("strictQuery", true);

export async function connectMongo(): Promise<typeof mongoose> {
  try {
    const connection = await mongoose.connect(env.brandDbUrl, {
      appName: "rapidquest-api-gateway",
    });
    logger.info({ event: "mongo_connected", uri: env.brandDbUrl });
    return connection;
  } catch (error) {
    logger.error({ event: "mongo_connection_error", error });
    throw error;
  }
}

export async function closeMongo(): Promise<void> {
  await mongoose.disconnect();
  logger.info({ event: "mongo_disconnected" });
}
