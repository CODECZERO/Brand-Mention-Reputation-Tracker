import type { Logger } from "pino";

export interface ErrorContext {
  readonly location: string;
  readonly brand?: string;
  readonly metadata?: Record<string, unknown>;
}

interface NormalisedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly cause?: unknown;
}

export function normaliseError(error: unknown): NormalisedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as { cause?: unknown }).cause,
    };
  }

  if (typeof error === "string") {
    return {
      name: "Error",
      message: error,
    };
  }

  return {
    name: "UnknownError",
    message: JSON.stringify(error, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
  };
}

export function logRecoverableError(logger: Logger, error: unknown, context: ErrorContext, message: string): void {
  logger.error(
    {
      error: normaliseError(error),
      context,
    },
    message
  );
}

export function logFatalError(logger: Logger, error: unknown, context: ErrorContext, message: string): never {
  logger.fatal(
    {
      error: normaliseError(error),
      context,
    },
    message
  );
  throw error instanceof Error ? error : new Error(message);
}
