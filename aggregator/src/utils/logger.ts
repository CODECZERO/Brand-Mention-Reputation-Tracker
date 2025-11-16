import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.logger.level,
  base: { service: "aggregator" },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport:
    env.nodeEnv === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            singleLine: false,
          },
        }
      : undefined,
});
