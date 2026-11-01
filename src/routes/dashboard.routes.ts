import { Hono } from 'hono';
import { todayLocal } from '../lib/dates';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getDashboardStats } from '../services/dashboard.service';
import type { AppEnv } from '../types';
import { dashboardQuerySchema } from '../validators/dashboard.validator';

// Mounted at /api/dashboard in app.ts. Requires a logged-in user.
export const dashboardRoutes = new Hono<AppEnv>();
dashboardRoutes.use('*', requireAuth);

// GET /api/dashboard?today=YYYY-MM-DD
dashboardRoutes.get('/', validate('query', dashboardQuerySchema), (c) => {
  const { today } = c.req.valid('query');
  const stats = getDashboardStats(c.get('db'), c.get('user').id, today ?? todayLocal());
  return c.json({ data: stats });
});
