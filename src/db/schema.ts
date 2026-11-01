import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// The allowed values for a task's status and priority, and a user's role.
// "as const" tells TypeScript these exact strings are the only possibilities.
export const TASK_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const USER_ROLES = ['user', 'admin'] as const;

// The "users" table. Each row is one account that can log in.
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  // Always stored in lower case, so "Sam@Mail.com" and "sam@mail.com" are the same account.
  email: text('email').notNull().unique(),
  // NEVER the password itself: a scrypt hash like "scrypt:<salt>:<hash>".
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull().default('user'),
  createdAt: text('created_at').notNull(),
});

// The "sessions" table. A row exists for every logged-in browser.
export const sessions = sqliteTable(
  'sessions',
  {
    // The SHA-256 hash of the random token stored in the browser's cookie.
    // Storing only the hash means a stolen database cannot be used to log in.
    id: text('id').primaryKey(),
    // Deleting a user deletes all their sessions ("cascade").
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

// The "categories" table. Each row is one category, e.g. "Work" or "Home".
export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // The owner. NULL only for data created before accounts existed
    // (the first account to register claims those rows).
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#6366f1'),
    createdAt: text('created_at').notNull(),
  },
  // Category names are unique per user: two users may both have "Work".
  (table) => [uniqueIndex('categories_user_name_unique').on(table.userId, table.name)],
);

// The "tasks" table. Each row is one to-do item.
// WHO may see a task is stored in "task_assignees" (below), not here.
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // The user who created the task. Only administrators are shown this.
    // NULL for very old tasks, or if the creator's account was deleted.
    createdById: integer('created_by').references(() => users.id, { onDelete: 'set null' }),    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('pending'),
    priority: text('priority', { enum: TASK_PRIORITIES }).notNull().default('medium'),
    // Foreign key: points at categories.id. If the category is deleted,
    // the task stays but its category_id becomes NULL ("uncategorized").
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    // Stored as "YYYY-MM-DD" text, or NULL when the task has no due date.
    dueDate: text('due_date'),
    // Stored as ISO 8601 timestamps, e.g. "2026-11-01T09:30:00.000Z".
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // Indexes make filtering by these columns faster as the table grows.
    index('tasks_created_by_idx').on(table.createdById),
    index('tasks_status_idx').on(table.status),
    index('tasks_due_date_idx').on(table.dueDate),
    index('tasks_category_idx').on(table.categoryId),
  ],
);

// The "task_assignees" table: which users a task is assigned to.
// One row  = an INDIVIDUAL task.  Several rows = a GROUP task.
// This is a "many-to-many" link table: a task can have many users,
// and a user can have many tasks.
export const taskAssignees = sqliteTable(
  'task_assignees',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    assignedAt: text('assigned_at').notNull(),
  },
  (table) => [
    // The pair (task, user) is the primary key: nobody is assigned twice.
    primaryKey({ columns: [table.taskId, table.userId] }),
    index('task_assignees_user_idx').on(table.userId),
  ],
);

// The "subtasks" table: a checklist of smaller steps inside a task.
export const subtasks = sqliteTable(
  'subtasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Deleting a task deletes its subtasks too.
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // SQLite has no true/false type; Drizzle stores booleans as 0/1.
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('subtasks_task_idx').on(table.taskId)],
);

// TypeScript types generated from the tables above.
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Subtask = typeof subtasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
