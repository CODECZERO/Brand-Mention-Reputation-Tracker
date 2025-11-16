import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
});
