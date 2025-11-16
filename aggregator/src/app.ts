import express, { type Application, type Router } from "express";
import cors, { type CorsOptions } from "cors";
import compression from "compression";
import helmet from "helmet";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";

export interface AppRouters {
  health: Router;
  metrics: Router;
  aggregator: Router;
  brands: Router;
}

export function createApp({ health, metrics, aggregator, brands }: AppRouters): Application {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  const corsOptions: CorsOptions = {
    origin: "*",
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["*"],
  };
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(compression());

  app.use("/health", health);
  app.use("/metrics", metrics);
  app.use("/aggregations", aggregator);
  app.use("/brands", brands);

  app.get("/", (_req, res) => {
    res.json({ service: "aggregator", status: "ok" });
  });

  return app;
}

export function startHttpServer(app: Application): void {
  app.listen(env.aggregator.port, () => {
    console.log(`Aggregator service listening on port ${env.aggregator.port}`);
    logger.info({ port: env.aggregator.port }, "Aggregator service listening");
  });
}
