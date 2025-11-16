export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly data: unknown;
  public readonly success = false;
  public readonly errors: unknown[];

  constructor(statusCode = 500, message: string | null = "Something went wrong", errors: unknown[] = [], stack = "") {
    super(message ?? undefined);
    this.statusCode = statusCode;
    this.data = message;
    this.errors = errors;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation failed", errors: unknown[] = []) {
    super(400, message, errors);
  }
}

export function wrapError(error: unknown, defaultMessage = "Unhandled error"): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(500, error.message, [], error.stack ?? "");
  }

  return new ApiError(500, defaultMessage, [error]);
}
