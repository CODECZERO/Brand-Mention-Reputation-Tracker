import pino from "pino";
import { config } from "./config.js";

const isProduction = config.NODE_ENV === "production";

export const logger = pino({
  level: config.LOG_LEVEL,
  base: {
    orchestratorId: config.ORCHESTRATOR_ID,
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
        },
      },
});
