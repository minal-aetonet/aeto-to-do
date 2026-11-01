import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { categories, tasks, type Category } from '../db/schema';
import { ConflictError, NotFoundError } from '../lib/errors';
import { nowIso } from '../lib/dates';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

// AUTHORIZATION: every function receives the logged-in user's ID and only
// ever reads or changes that user's categories.

export type CategoryWithCount = Omit<Category, 'userId'> & { taskCount: number };

/** The user's categories, alphabetically, each with the number of tasks using it. */
export function listCategories(db: AppDatabase, userId: number): CategoryWithCount[] {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      color: categories.color,
      createdAt: categories.createdAt,
      taskCount: count(tasks.id),
    })
    .from(categories)
    .leftJoin(tasks, eq(tasks.categoryId, categories.id))
    .where(eq(categories.userId, userId))
    .groupBy(categories.id)
    .orderBy(asc(sql`${categories.name} COLLATE NOCASE`))
    .all();
}

/**
 * One of the user's categories by ID. Throws NotFoundError if it does not
 * exist OR belongs to someone else — we never reveal other users' data.
 */
export function getCategoryById(db: AppDatabase, userId: number, id: number): Category {
  const category = db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .get();
  if (!category) {
    throw new NotFoundError(`Category ${id} was not found.`);
  }
  return category;
}

/** Throws ConflictError if another of the user's categories uses this name (any letter case). */
function ensureNameIsFree(db: AppDatabase, userId: number, name: string, ignoreId?: number): void {
  const existing = db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), sql`lower(${categories.name}) = lower(${name})`))
    .get();
  if (existing && existing.id !== ignoreId) {
    throw new ConflictError(`A category named "${name}" already exists.`);
  }
}

export function createCategory(db: AppDatabase, userId: number, input: CreateCategoryInput): Category {
  ensureNameIsFree(db, userId, input.name);
  return db
    .insert(categories)
    .values({ userId, name: input.name, color: input.color, createdAt: nowIso() })
    .returning()
    .get();
}

export function updateCategory(db: AppDatabase, userId: number, id: number, input: UpdateCategoryInput): Category {
  getCategoryById(db, userId, id); // throws 404 if missing or not ours
  if (input.name !== undefined) {
    ensureNameIsFree(db, userId, input.name, id);
  }
  return db
    .update(categories)
    .set({ name: input.name, color: input.color })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning()
    .get();
}

/**
 * Deletes a category. Tasks in it are NOT deleted: the foreign key rule
 * "ON DELETE SET NULL" makes them uncategorized automatically.
 */
export function deleteCategory(db: AppDatabase, userId: number, id: number): void {
  getCategoryById(db, userId, id); // throws 404 if missing or not ours
  db.delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .run();
}
