import type { NextFunction, Request, Response } from "express";
import { AppError, ValidationError, RedisUnavailableError } from "../utils/errors";
import { logger } from "../utils/logger";

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ValidationError || error instanceof RedisUnavailableError) {
    res.status(error.statusCode).json({ status: "error", message: error.message });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ status: "error", message: error.message });
    return;
  }

  logger.error({ event: "unhandled_error", error, path: req.path });
  res.status(500).json({ status: "error", message: "Internal server error" });
}
