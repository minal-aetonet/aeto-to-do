import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { AppError } from '../lib/errors';

/**
 * Central error handler, registered with app.onError().
 * Any error thrown in middleware, validators, routes or services ends up here
 * and is turned into one consistent JSON shape:
 *   { "error": { "code": "...", "message": "...", "details": ... } }
 */
export const errorHandler: ErrorHandler = (err, c) => {
  // Errors we threw on purpose (validation, not found, conflict, ...).
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status,
    );
  }

  // Errors raised by Hono itself, e.g. a request body that is not valid JSON.
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: 'HTTP_ERROR', message: err.message } },
      err.status as ContentfulStatusCode,
    );
  }

  // Anything else is a bug. Log the full details on the server, but never
  // send internal details (like stack traces) to the browser.
  console.error('Unexpected error:', err);
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } },
    500,
  );
};

/** Handles requests that matched no route, registered with app.notFound(). */
export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(
    { error: { code: 'NOT_FOUND', message: `Route ${c.req.method} ${c.req.path} was not found.` } },
    404,
  );
};
