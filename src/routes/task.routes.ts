import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as subtaskService from '../services/subtask.service';
import * as taskService from '../services/task.service';
import type { AppEnv } from '../types';
import { idParamSchema } from '../validators/common';
import { createSubtaskSchema } from '../validators/subtask.validator';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from '../validators/task.validator';

// A small Hono app containing only task routes. app.ts mounts it at /api/tasks,
// so "/" here means "/api/tasks" and "/:id" means "/api/tasks/:id".
export const taskRoutes = new Hono<AppEnv>();

// Every task route requires a logged-in user. After this line,
// c.get('user') is always the user who sent the request. The services
// receive that user (the "viewer") and apply the authorization rules.
taskRoutes.use('*', requireAuth);

// GET /api/tasks?search=&status=&priority=&categoryId=&due=&kind=&dueFrom=&dueTo=&sort=&order=&today=
// The tasks ASSIGNED TO the logged-in user.
taskRoutes.get('/', validate('query', listTasksQuerySchema), (c) => {
  const query = c.req.valid('query');
  const tasks = taskService.listTasks(c.get('db'), c.get('user'), query, 'mine');
  return c.json({ data: tasks });
});

// GET /api/tasks/:id
taskRoutes.get('/:id', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  const task = taskService.getTaskById(c.get('db'), c.get('user'), id);
  return c.json({ data: task });
});

// POST /api/tasks  (body: JSON task; admins may include assigneeIds)
taskRoutes.post('/', validate('json', createTaskSchema), (c) => {
  const input = c.req.valid('json');
  const task = taskService.createTask(c.get('db'), c.get('user'), input);
  return c.json({ data: task }, 201); // 201 Created
});

// PATCH /api/tasks/:id  (body: only the fields to change)
taskRoutes.patch('/:id', validate('param', idParamSchema), validate('json', updateTaskSchema), (c) => {
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const task = taskService.updateTask(c.get('db'), c.get('user'), id, input);
  return c.json({ data: task });
});

// POST /api/tasks/:id/complete
taskRoutes.post('/:id/complete', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  return c.json({ data: taskService.completeTask(c.get('db'), c.get('user'), id) });
});

// POST /api/tasks/:id/reopen
taskRoutes.post('/:id/reopen', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  return c.json({ data: taskService.reopenTask(c.get('db'), c.get('user'), id) });
});

// POST /api/tasks/:id/subtasks  (body: { title }) — add a subtask inside a task
taskRoutes.post('/:id/subtasks', validate('param', idParamSchema), validate('json', createSubtaskSchema), (c) => {
  const { id } = c.req.valid('param');
  const subtask = subtaskService.addSubtask(c.get('db'), c.get('user'), id, c.req.valid('json'));
  return c.json({ data: subtask }, 201);
});

// DELETE /api/tasks/:id  (only the creator or an admin)
taskRoutes.delete('/:id', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  taskService.deleteTask(c.get('db'), c.get('user'), id);
  return c.body(null, 204); // 204 No Content: success, nothing to send back
});
