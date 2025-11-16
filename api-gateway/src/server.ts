import { createServer } from "http";
import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./utils/logger";
import { connectMongo, closeMongo } from "./config/mongo";
import { redis } from "./utils/redis";

async function bootstrap(): Promise<void> {
  try {
    await connectMongo();
    await redis.connect();

    const app = createApp();
    const server = createServer(app);

    server.listen(env.port, () => {
      logger.info({ event: "server_started", port: env.port });
    });

    const shutdown = async (signal: string) => {
      logger.info({ event: "server_shutdown", signal });
      server.close(async () => {
        await Promise.allSettled([closeMongo(), redis.disconnect()]);
        process.exit(0);
      });
    };

    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    logger.error({ event: "bootstrap_error", error });
    process.exit(1);
  }
}

void bootstrap();
