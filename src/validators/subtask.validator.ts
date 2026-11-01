import { z } from 'zod';

const title = z
  .string({ message: 'Subtask title must be text' })
  .trim()
  .min(1, { message: 'Subtask title is required' })
  .max(200, { message: 'Subtask title must be 200 characters or fewer' });

/** Body of POST /api/tasks/:id/subtasks. */
export const createSubtaskSchema = z.object({ title });

/** Body of PATCH /api/subtasks/:id. */
export const updateSubtaskSchema = z
  .object({
    title: title.optional(),
    done: z.boolean({ message: 'done must be true or false' }).optional(),
  })
  .refine((data) => data.title !== undefined || data.done !== undefined, {
    message: 'Provide a title or done to update',
  });

export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
