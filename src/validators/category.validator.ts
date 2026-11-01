import { z } from 'zod';

const name = z
  .string({ message: 'Name must be text' })
  .trim()
  .min(1, { message: 'Name is required' })
  .max(50, { message: 'Name must be 50 characters or fewer' });
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Color must be a hex color like #6366f1' });

/** Body of POST /api/categories. */
export const createCategorySchema = z.object({
  name,
  color: color.default('#6366f1'),
});

/** Body of PATCH /api/categories/:id. */
export const updateCategorySchema = z
  .object({
    name: name.optional(),
    color: color.optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: 'Provide a name or a color to update',
  });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
