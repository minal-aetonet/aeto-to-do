import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { ValidationError } from '../lib/errors';

/**
 * Validation middleware.
 *
 * Checks one part of the request (the JSON body, the query string or the URL
 * parameters) against a Zod schema BEFORE the route handler runs.
 *  - Valid data: the handler can read the cleaned data with c.req.valid(target).
 *  - Invalid data: we throw a ValidationError; the error handler turns it into
 *    a 400 response listing every problem, and the handler never runs.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || target,
        message: issue.message,
      }));
      throw new ValidationError('The request contains invalid data.', details);
    }
  });
}
