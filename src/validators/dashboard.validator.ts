import { z } from 'zod';
import { dateString } from './common';

/** Query string of GET /api/dashboard, e.g. ?today=2026-11-01 */
export const dashboardQuerySchema = z.object({
  today: dateString.optional(),
});
