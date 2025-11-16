import express, { type Application } from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { healthRouter } from "./routes/health.routes";
import { metricsRouter } from "./routes/metrics.routes";
import { brandRouter } from "./routes/brand.routes";
import { errorHandler } from "./middleware/error-handler";

export function createApp(): Application {
  const app = express();

  app.use(helmet());

  const allowedOriginsRaw = env.allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const allowAllOrigins = allowedOriginsRaw.includes("*");
  const corsOptions: CorsOptions = allowAllOrigins
    ? { origin: "*" }
    : { origin: Array.from(new Set(allowedOriginsRaw)) };

  app.use(cors(corsOptions));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: env.rateLimit,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on("finish", () => {
      const statusCode = res.statusCode ?? 0;
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

      const logFn = (logger as unknown as Record<string, (msg: unknown) => void>)[level];
      logFn?.call(logger, {
        route: req.path,
        method: req.method,
        statusCode,
        totalRequestTime: durationSeconds,
      });
    });

    next();
  });

  app.use(healthRouter);
  app.use(metricsRouter);
  app.use("/api/brands", brandRouter);

  app.use((req, res) => {
    res.status(404).json({ status: "error", message: "Route not found" });
  });

  app.use(errorHandler);

  logger.debug({ event: "app_initialized", port: env.port });

  return app;
}
