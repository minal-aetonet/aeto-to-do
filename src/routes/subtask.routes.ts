import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as subtaskService from '../services/subtask.service';
import type { AppEnv } from '../types';
import { idParamSchema } from '../validators/common';
import { updateSubtaskSchema } from '../validators/subtask.validator';

// Mounted at /api/subtasks in app.ts. (Creating a subtask lives in
// task.routes.ts as POST /api/tasks/:id/subtasks, because it needs the task.)
export const subtaskRoutes = new Hono<AppEnv>();
subtaskRoutes.use('*', requireAuth);

// PATCH /api/subtasks/:id  (body: { title?, done? })
subtaskRoutes.patch('/:id', validate('param', idParamSchema), validate('json', updateSubtaskSchema), (c) => {
  const { id } = c.req.valid('param');
  const subtask = subtaskService.updateSubtask(c.get('db'), c.get('user'), id, c.req.valid('json'));
  return c.json({ data: subtask });
});

// DELETE /api/subtasks/:id
subtaskRoutes.delete('/:id', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  subtaskService.deleteSubtask(c.get('db'), c.get('user'), id);
  return c.body(null, 204);
});
