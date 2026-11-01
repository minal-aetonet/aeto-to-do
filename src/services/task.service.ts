import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { categories, subtasks, taskAssignees, tasks, users, type Category, type Subtask, type Task } from '../db/schema';
import { AppError, NotFoundError } from '../lib/errors';
import { nowIso, todayLocal } from '../lib/dates';
import type { PublicUser } from './auth.service';
import type { CreateTaskInput, ListTasksQuery, UpdateTaskInput } from '../validators/task.validator';

// AUTHORIZATION RULES FOR TASKS
//  - A task is visible to the users it is ASSIGNED to (table task_assignees).
//    One assignee = individual task, several assignees = group task.
//  - Administrators can see and edit every task, and choose the assignees.
//  - Every assignee can edit, complete and reopen the task and its subtasks.
//  - Only the task's creator or an administrator can delete it.
//  - Only administrators are told WHO created a task.
// Tasks you may not see behave exactly like tasks that do not exist (404).

/** The person asking. PublicUser (from requireAuth) has exactly these fields and more. */
export type Viewer = Pick<PublicUser, 'id' | 'role'>;

/** A task as the API returns it. */
export type TaskView = Omit<Task, 'createdById'> & {
  category: Pick<Category, 'id' | 'name' | 'color'> | null;
  assignees: { id: number; name: string }[];
  isGroup: boolean;
  subtasks: Omit<Subtask, 'taskId'>[];
  /** May the viewer delete this task? (creator or admin) — lets the page hide the button. */
  canDelete: boolean;
  /** Only present when the viewer is an administrator. */
  createdBy?: { id: number; name: string; email: string } | null;
};

/** Which tasks a list should start from. */
export type TaskScope = 'mine' | 'all';

// SQL that turns a priority word into a number so we can sort by importance.
const priorityRank = sql`CASE ${tasks.priority} WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`;

// SQL that counts how many people a task is assigned to.
const assigneeCount = sql`(SELECT COUNT(*) FROM ${taskAssignees} WHERE ${taskAssignees.taskId} = ${tasks.id})`;

/** A sub-query: the IDs of all tasks assigned to one user. */
function taskIdsAssignedTo(db: AppDatabase, userId: number) {
  return db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, userId));
}

/** Starts a SELECT that joins each task with its category (if it has one). */
function selectTasksWithCategory(db: AppDatabase) {
  return db
    .select({ task: tasks, category: categories })
    .from(tasks)
    .leftJoin(categories, eq(tasks.categoryId, categories.id));
}

/**
 * Turns database rows into TaskView objects: loads the assignees and
 * subtasks of all the tasks at once (2 queries, not 2 per task) and, for
 * administrators only, who created each task.
 */
function hydrate(db: AppDatabase, viewer: Viewer, rows: { task: Task; category: Category | null }[]): TaskView[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.task.id);

  const assigneeRows = db
    .select({ taskId: taskAssignees.taskId, id: users.id, name: users.name })
    .from(taskAssignees)
    .innerJoin(users, eq(users.id, taskAssignees.userId))
    .where(inArray(taskAssignees.taskId, ids))
    .orderBy(asc(users.name))
    .all();

  const subtaskRows = db.select().from(subtasks).where(inArray(subtasks.taskId, ids)).orderBy(asc(subtasks.id)).all();

  const isAdmin = viewer.role === 'admin';
  const creatorIds = [...new Set(rows.map((row) => row.task.createdById).filter((id): id is number => id !== null))];
  const creators =
    isAdmin && creatorIds.length > 0
      ? db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, creatorIds)).all()
      : [];

  return rows.map(({ task, category }) => {
    const { createdById, ...taskFields } = task;
    const assignees = assigneeRows.filter((a) => a.taskId === task.id).map(({ id, name }) => ({ id, name }));
    const view: TaskView = {
      ...taskFields,
      category: category ? { id: category.id, name: category.name, color: category.color } : null,
      assignees,
      isGroup: assignees.length > 1,
      subtasks: subtaskRows.filter((s) => s.taskId === task.id).map(({ taskId: _taskId, ...rest }) => rest),
      canDelete: isAdmin || createdById === viewer.id,
    };
    if (isAdmin) {
      view.createdBy = creators.find((c) => c.id === createdById) ?? null;
    }
    return view;
  });
}

/**
 * Loads a task row the viewer is allowed to see: any task for an admin,
 * otherwise only tasks assigned to the viewer. Throws 404 otherwise.
 * Exported because the subtask service uses the same rule.
 */
export function getAccessibleTask(db: AppDatabase, viewer: Viewer, id: number): Task {
  const conditions: SQL[] = [eq(tasks.id, id)];
  if (viewer.role !== 'admin') {
    conditions.push(inArray(tasks.id, taskIdsAssignedTo(db, viewer.id)));
  }
  const task = db.select().from(tasks).where(and(...conditions)).get();
  if (!task) {
    throw new NotFoundError(`Task ${id} was not found.`);
  }
  return task;
}

/** Throws a 400 error if a categoryId is not one of THIS user's categories. */
function ensureCategoryExists(db: AppDatabase, userId: number, categoryId: number | null | undefined): void {
  if (categoryId === null || categoryId === undefined) return;
  const found = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .get();
  if (!found) {
    throw new AppError(`Category ${categoryId} does not exist.`, 400, 'INVALID_CATEGORY');
  }
}

/**
 * Works out the final list of assignees and checks the rules:
 *  - nothing given: the task is assigned to the viewer (an individual task);
 *  - only administrators may assign tasks to other people;
 *  - every user ID must exist.
 */
function resolveAssignees(db: AppDatabase, viewer: Viewer, assigneeIds: number[] | undefined): number[] {
  if (assigneeIds === undefined) return [viewer.id];
  const unique = [...new Set(assigneeIds)];
  if (viewer.role !== 'admin' && unique.some((id) => id !== viewer.id)) {
    throw new AppError('Only administrators can assign tasks to other people.', 403, 'FORBIDDEN');
  }
  const found = db.select({ id: users.id }).from(users).where(inArray(users.id, unique)).all();
  if (found.length !== unique.length) {
    const missing = unique.filter((id) => !found.some((f) => f.id === id));
    throw new AppError(`User ${missing.join(', ')} does not exist.`, 400, 'INVALID_ASSIGNEE');
  }
  return unique;
}

/**
 * Lists tasks with optional search, filters and sorting.
 *  - scope "mine": tasks assigned to the viewer (used by everyone's own views);
 *  - scope "all":  every task (admin page only — the route checks the role).
 */
export function listTasks(
  db: AppDatabase,
  viewer: Viewer,
  query: ListTasksQuery & { assigneeId?: number },
  scope: TaskScope = 'mine',
): TaskView[] {
  const today = query.today ?? todayLocal();
  const conditions: SQL[] = [];

  if (scope === 'mine') {
    conditions.push(inArray(tasks.id, taskIdsAssignedTo(db, viewer.id)));
  } else if (query.assigneeId) {
    conditions.push(inArray(tasks.id, taskIdsAssignedTo(db, query.assigneeId)));
  }

  if (query.search) {
    // The search text becomes a query PARAMETER, never part of the SQL text,
    // so it cannot be used for SQL injection. SQLite's LIKE ignores letter case.
    const pattern = `%${query.search}%`;
    conditions.push(or(like(tasks.title, pattern), like(tasks.description, pattern))!);
  }
  if (query.status) conditions.push(eq(tasks.status, query.status));
  if (query.priority) conditions.push(eq(tasks.priority, query.priority));
  if (query.categoryId) conditions.push(eq(tasks.categoryId, query.categoryId));
  if (query.kind === 'group') conditions.push(sql`${assigneeCount} > 1`);
  if (query.kind === 'individual') conditions.push(sql`${assigneeCount} <= 1`);
  if (query.dueFrom) conditions.push(gte(tasks.dueDate, query.dueFrom));
  if (query.dueTo) conditions.push(lte(tasks.dueDate, query.dueTo));

  if (query.due === 'overdue') {
    conditions.push(isNotNull(tasks.dueDate), lt(tasks.dueDate, today), ne(tasks.status, 'completed'));
  } else if (query.due === 'today') {
    conditions.push(eq(tasks.dueDate, today));
  } else if (query.due === 'upcoming') {
    conditions.push(gt(tasks.dueDate, today));
  } else if (query.due === 'none') {
    conditions.push(isNull(tasks.dueDate));
  }

  const direction = query.order === 'asc' ? asc : desc;
  let orderBy: SQL[];
  switch (query.sort) {
    case 'priority':
      orderBy = [direction(priorityRank)];
      break;
    case 'dueDate':
      // Tasks without a due date always go last, whichever direction we sort.
      orderBy = [sql`${tasks.dueDate} IS NULL`, direction(tasks.dueDate)];
      break;
    case 'title':
      orderBy = [direction(sql`${tasks.title} COLLATE NOCASE`)];
      break;
    case 'updatedAt':
      orderBy = [direction(tasks.updatedAt)];
      break;
    default:
      orderBy = [direction(tasks.createdAt)];
  }
  // A final tie-breaker so the order is always predictable.
  orderBy.push(desc(tasks.id));

  const rows = selectTasksWithCategory(db)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .all();
  return hydrate(db, viewer, rows);
}

/** One task by ID, if the viewer may see it (404 otherwise). */
export function getTaskById(db: AppDatabase, viewer: Viewer, id: number): TaskView {
  getAccessibleTask(db, viewer, id);
  const row = selectTasksWithCategory(db).where(eq(tasks.id, id)).get()!;
  return hydrate(db, viewer, [row])[0];
}

export function createTask(db: AppDatabase, viewer: Viewer, input: CreateTaskInput): TaskView {
  const { assigneeIds, ...fields } = input;
  const assignees = resolveAssignees(db, viewer, assigneeIds);
  ensureCategoryExists(db, viewer.id, fields.categoryId);
  const timestamp = nowIso();

  // Task and assignees are saved together, or not at all.
  const id = db.transaction((tx) => {
    const created = tx
      .insert(tasks)
      .values({ ...fields, createdById: viewer.id, createdAt: timestamp, updatedAt: timestamp })
      .returning({ id: tasks.id })
      .get();
    tx.insert(taskAssignees)
      .values(assignees.map((userId) => ({ taskId: created.id, userId, assignedAt: timestamp })))
      .run();
    return created.id;
  });
  return getTaskById(db, viewer, id);
}

export function updateTask(db: AppDatabase, viewer: Viewer, id: number, input: UpdateTaskInput): TaskView {
  const current = getAccessibleTask(db, viewer, id); // throws 404 if the viewer may not see it
  const { assigneeIds, ...fields } = input;

  if (assigneeIds !== undefined && viewer.role !== 'admin') {
    throw new AppError('Only administrators can change who a task is assigned to.', 403, 'FORBIDDEN');
  }
  const assignees = assigneeIds === undefined ? undefined : resolveAssignees(db, viewer, assigneeIds);

  // A category is only checked when it CHANGES. Group members may keep a
  // category that the task's creator chose, but may only pick their own.
  if (fields.categoryId !== undefined && fields.categoryId !== current.categoryId) {
    ensureCategoryExists(db, viewer.id, fields.categoryId);
  }

  const timestamp = nowIso();
  db.transaction((tx) => {
    tx.update(tasks).set({ ...fields, updatedAt: timestamp }).where(eq(tasks.id, id)).run();
    if (assignees) {
      tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id)).run();
      tx.insert(taskAssignees)
        .values(assignees.map((userId) => ({ taskId: id, userId, assignedAt: timestamp })))
        .run();
    }
  });
  return getTaskById(db, viewer, id);
}

export function deleteTask(db: AppDatabase, viewer: Viewer, id: number): void {
  const task = getAccessibleTask(db, viewer, id); // throws 404 if the viewer may not see it
  if (viewer.role !== 'admin' && task.createdById !== viewer.id) {
    throw new AppError('Only the person who created this task or an administrator can delete it.', 403, 'FORBIDDEN');
  }
  // Assignees and subtasks are deleted automatically (ON DELETE CASCADE).
  db.delete(tasks).where(eq(tasks.id, id)).run();
}

/** Marks a task as completed. */
export function completeTask(db: AppDatabase, viewer: Viewer, id: number): TaskView {
  return updateTask(db, viewer, id, { status: 'completed' });
}

/** Moves a completed task back to "pending". */
export function reopenTask(db: AppDatabase, viewer: Viewer, id: number): TaskView {
  return updateTask(db, viewer, id, { status: 'pending' });
}
