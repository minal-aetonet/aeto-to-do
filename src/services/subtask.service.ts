import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { subtasks, tasks, type Subtask } from '../db/schema';
import { nowIso } from '../lib/dates';
import { NotFoundError } from '../lib/errors';
import type { CreateSubtaskInput, UpdateSubtaskInput } from '../validators/subtask.validator';
import { getAccessibleTask, type Viewer } from './task.service';

// A subtask is a checklist item INSIDE a task. Whoever may see (and therefore
// edit) the parent task may add, tick, rename and delete its subtasks.

export type SubtaskView = Omit<Subtask, 'taskId'>;

function toView({ taskId: _taskId, ...rest }: Subtask): SubtaskView {
  return rest;
}

/** Changing a subtask counts as changing its task, so "updated" moves forward. */
function touchTask(db: AppDatabase, taskId: number): void {
  db.update(tasks).set({ updatedAt: nowIso() }).where(eq(tasks.id, taskId)).run();
}

/**
 * Loads a subtask whose parent task the viewer may see.
 * Throws 404 when it does not exist OR belongs to a task the viewer cannot see.
 */
function getAccessibleSubtask(db: AppDatabase, viewer: Viewer, id: number): Subtask {
  const subtask = db.select().from(subtasks).where(eq(subtasks.id, id)).get();
  if (!subtask) throw new NotFoundError(`Subtask ${id} was not found.`);
  try {
    getAccessibleTask(db, viewer, subtask.taskId);
  } catch {
    // Same message as "does not exist", so the subtask's existence is not revealed.
    throw new NotFoundError(`Subtask ${id} was not found.`);
  }
  return subtask;
}

export function addSubtask(db: AppDatabase, viewer: Viewer, taskId: number, input: CreateSubtaskInput): SubtaskView {
  getAccessibleTask(db, viewer, taskId); // 404 if the viewer may not see the task
  const subtask = db
    .insert(subtasks)
    .values({ taskId, title: input.title, done: false, createdAt: nowIso() })
    .returning()
    .get();
  touchTask(db, taskId);
  return toView(subtask);
}

export function updateSubtask(db: AppDatabase, viewer: Viewer, id: number, input: UpdateSubtaskInput): SubtaskView {
  const current = getAccessibleSubtask(db, viewer, id);
  const updated = db
    .update(subtasks)
    .set({ title: input.title, done: input.done })
    .where(eq(subtasks.id, id))
    .returning()
    .get();
  touchTask(db, current.taskId);
  return toView(updated);
}

export function deleteSubtask(db: AppDatabase, viewer: Viewer, id: number): void {
  const current = getAccessibleSubtask(db, viewer, id);
  db.delete(subtasks).where(eq(subtasks.id, id)).run();
  touchTask(db, current.taskId);
}
