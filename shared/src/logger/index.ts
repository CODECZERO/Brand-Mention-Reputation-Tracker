import { createLogger, format, transports, Logger } from "winston";
import { isProduction } from "../config/env.js";

const { combine, timestamp, printf, colorize, errors, splat } = format;

const baseFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${ts} [${level}] ${message}${metaString}`;
});

let cachedLogger: Logger | undefined;

export function getLogger(scope?: string): Logger {
  if (!cachedLogger) {
    cachedLogger = createLogger({
      level: isProduction ? "info" : "debug",
      format: combine(
        errors({ stack: true }),
        splat(),
        timestamp(),
        baseFormat
      ),
      transports: [
        new transports.Console({
          format: combine(colorize({ all: !isProduction }), baseFormat),
        }),
      ],
    });
  }

  if (!scope) {
    return cachedLogger;
  }

  return cachedLogger.child({ scope });
}

export const logger = getLogger();

export function logGracefulWait(source: string, details: Record<string, unknown>): void {
  // Waiting handler logging to keep parity with Testcore-style observability.
  logger.warn(`Waiting state encountered in ${source}`, {
    "waiting.handler": true,
    ...details,
  });
}
