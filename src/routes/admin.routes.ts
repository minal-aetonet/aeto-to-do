import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { listUsers } from '../services/auth.service';
import { listTasks } from '../services/task.service';
import type { AppEnv } from '../types';
import { adminListTasksQuerySchema } from '../validators/task.validator';

// Mounted at /api/admin in app.ts. Every route here needs a logged-in admin:
// requireAuth answers 401 for visitors, requireRole answers 403 for normal users.
export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth, requireRole('admin'));

// GET /api/admin/users — every account (also used to choose assignees)
adminRoutes.get('/users', (c) => {
  return c.json({ data: listUsers(c.get('db')) });
});

// GET /api/admin/tasks?assigneeId=&...the same filters as /api/tasks
// EVERY task, with its assignees and who created it.
adminRoutes.get('/tasks', validate('query', adminListTasksQuerySchema), (c) => {
  const query = c.req.valid('query');
  return c.json({ data: listTasks(c.get('db'), c.get('user'), query, 'all') });
});
