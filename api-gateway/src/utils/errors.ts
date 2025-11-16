export class AppError extends Error {
  constructor(message: string, public readonly statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class RedisUnavailableError extends AppError {
  constructor(message = "Redis unavailable") {
    super(message, 503);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, statusCode = 400) {
    super(message, statusCode);
  }
}
