import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * An error we throw on purpose, carrying the HTTP status code and a short
 * machine-readable code. The error handler middleware turns it into JSON.
 */
export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: ContentfulStatusCode, code: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 400 Bad Request: the data sent by the client is invalid. */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

/** 404 Not Found: the requested record does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

/** 409 Conflict: the request clashes with existing data (e.g. duplicate name). */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}
