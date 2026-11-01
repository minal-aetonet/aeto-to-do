import { z } from 'zod';
import { TASK_PRIORITIES, TASK_STATUSES } from '../db/schema';
import { dateString } from './common';

// Rules for each task field, shared by the "create" and "update" schemas.
const title = z
  .string({ message: 'Title must be text' })
  .trim()
  .min(1, { message: 'Title is required' })
  .max(200, { message: 'Title must be 200 characters or fewer' });
const description = z
  .string({ message: 'Description must be text' })
  .trim()
  .max(2000, { message: 'Description must be 2000 characters or fewer' });
const status = z.enum(TASK_STATUSES, { message: 'Status must be pending, in_progress or completed' });
const priority = z.enum(TASK_PRIORITIES, { message: 'Priority must be low, medium or high' });
const categoryId = z.number().int().positive().nullable();
const dueDate = dateString.nullable();
// Who the task is for. One ID = individual task, several = group task.
// Only administrators may include other people (checked in the service).
const assigneeIds = z
  .array(z.number().int().positive(), { message: 'assigneeIds must be a list of user IDs' })
  .min(1, { message: 'A task needs at least one assignee' })
  .max(50, { message: 'A task can have at most 50 assignees' });

/** Body of POST /api/tasks. Only the title is required. */
export const createTaskSchema = z.object({
  title,
  description: description.default(''),
  status: status.default('pending'),
  priority: priority.default('medium'),
  categoryId: categoryId.default(null),
  dueDate: dueDate.default(null),
  assigneeIds: assigneeIds.optional(),
});

/** Body of PATCH /api/tasks/:id. Every field is optional, but at least one is needed. */
export const updateTaskSchema = z
  .object({
    title: title.optional(),
    description: description.optional(),
    status: status.optional(),
    priority: priority.optional(),
    categoryId: categoryId.optional(),
    dueDate: dueDate.optional(),
    assigneeIds: assigneeIds.optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Provide at least one field to update',
  });

export const TASK_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title'] as const;
export const DUE_FILTERS = ['overdue', 'today', 'upcoming', 'none'] as const;
export const TASK_KINDS = ['individual', 'group'] as const;

/** Query string of GET /api/tasks, e.g. ?status=pending&sort=dueDate&order=asc */
export const listTasksQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: status.optional(),
  priority: priority.optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  due: z.enum(DUE_FILTERS).optional(),
  sort: z.enum(TASK_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  // Individual (one assignee) or group (several assignees) tasks only.
  kind: z.enum(TASK_KINDS).optional(),
  // A due-date range, used by the calendar: dueFrom <= due_date <= dueTo.
  dueFrom: dateString.optional(),
  dueTo: dateString.optional(),
  // The browser's local date, so "overdue" and "today" match the user's calendar.
  today: dateString.optional(),
});

/** Query string of GET /api/admin/tasks: the same filters plus "assigned to user X". */
export const adminListTasksQuerySchema = listTasksQuerySchema.extend({
  assigneeId: z.coerce.number().int().positive().optional(),
});

// TypeScript types inferred from the schemas (the data AFTER validation).
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
