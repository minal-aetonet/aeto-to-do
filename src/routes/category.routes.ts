import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as categoryService from '../services/category.service';
import type { AppEnv } from '../types';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator';
import { idParamSchema } from '../validators/common';

// Mounted at /api/categories in app.ts. Every route requires a logged-in user.
export const categoryRoutes = new Hono<AppEnv>();
categoryRoutes.use('*', requireAuth);

// GET /api/categories
categoryRoutes.get('/', (c) => {
  return c.json({ data: categoryService.listCategories(c.get('db'), c.get('user').id) });
});

// POST /api/categories
categoryRoutes.post('/', validate('json', createCategorySchema), (c) => {
  const category = categoryService.createCategory(c.get('db'), c.get('user').id, c.req.valid('json'));
  return c.json({ data: category }, 201);
});

// PATCH /api/categories/:id
categoryRoutes.patch('/:id', validate('param', idParamSchema), validate('json', updateCategorySchema), (c) => {
  const { id } = c.req.valid('param');
  const category = categoryService.updateCategory(c.get('db'), c.get('user').id, id, c.req.valid('json'));
  return c.json({ data: category });
});

// DELETE /api/categories/:id
categoryRoutes.delete('/:id', validate('param', idParamSchema), (c) => {
  const { id } = c.req.valid('param');
  categoryService.deleteCategory(c.get('db'), c.get('user').id, id);
  return c.body(null, 204);
});
