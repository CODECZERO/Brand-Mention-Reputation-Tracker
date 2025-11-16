import type { RequestHandler } from "express";
import { wrapError } from "./errors.js";
import { logger } from "../logger/index.js";

export const asyncHandler = (handler: RequestHandler): RequestHandler => {
  return ((req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      const wrapped = wrapError(error);
      logger.error("Unhandled async handler error", {
        scope: "asyncHandler",
        message: wrapped.message,
        stack: wrapped.stack,
        statusCode: wrapped.statusCode,
      });
      next(wrapped);
    });
  }) as RequestHandler;
};
