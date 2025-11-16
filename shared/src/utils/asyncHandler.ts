import { wrapError } from "./errors.js";
import { logger } from "../logger/index.js";

type NextFunction = (error?: unknown) => void;

export type RequestHandlerLike<Req = unknown, Res = unknown> = (
  req: Req,
  res: Res,
  next: NextFunction,
) => unknown;

export const asyncHandler = <Req = unknown, Res = unknown>(
  handler: RequestHandlerLike<Req, Res>,
): RequestHandlerLike<Req, Res> => {
  return ( (req: Req, res: Res, next: NextFunction) => {
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
  }) as RequestHandlerLike<Req, Res>;
};
