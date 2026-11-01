import { z } from 'zod';

/** A calendar date written as "YYYY-MM-DD", e.g. "2026-11-01". */
export const dateString = z.iso.date({ message: 'Must be a date in the format YYYY-MM-DD' });

/**
 * URL parameters always arrive as text ("/api/tasks/7" gives "7").
 * z.coerce.number() converts the text to a number before checking it.
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'ID must be a positive whole number' }),
});
