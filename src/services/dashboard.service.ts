import { eq, inArray, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { taskAssignees, tasks } from '../db/schema';

export type DashboardStats = {
  total: number;
  completed: number;
  pending: number;
  inProgress: number;
  overdue: number;
  dueToday: number;
  groupTasks: number;
  completionPercentage: number;
  today: string;
};

/**
 * Calculates every dashboard number for ONE user with ONE SQL query,
 * counting the tasks assigned to that user (individual and group tasks).
 * "SUM(CASE WHEN ... THEN 1 ELSE 0 END)" counts the rows that match a condition.
 *
 * Definitions:
 *  - overdue:    has a due date before today AND is not completed
 *  - dueToday:   due date is today AND is not completed
 *  - groupTasks: assigned to more than one person
 */
export function getDashboardStats(db: AppDatabase, userId: number, today: string): DashboardStats {
  const myTaskIds = db.select({ id: taskAssignees.taskId }).from(taskAssignees).where(eq(taskAssignees.userId, userId));
  const assigneeCount = sql`(SELECT COUNT(*) FROM ${taskAssignees} WHERE ${taskAssignees.taskId} = ${tasks.id})`;

  const row = db
    .select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
      pending: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'pending' THEN 1 ELSE 0 END), 0)`,
      inProgress: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'in_progress' THEN 1 ELSE 0 END), 0)`,
      overdue: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.dueDate} < ${today} AND ${tasks.status} != 'completed' THEN 1 ELSE 0 END), 0)`,
      dueToday: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.dueDate} = ${today} AND ${tasks.status} != 'completed' THEN 1 ELSE 0 END), 0)`,
      groupTasks: sql<number>`COALESCE(SUM(CASE WHEN ${assigneeCount} > 1 THEN 1 ELSE 0 END), 0)`,
    })
    .from(tasks)
    .where(inArray(tasks.id, myTaskIds)) // only tasks assigned to this user
    .get()!;

  const completionPercentage = row.total === 0 ? 0 : Math.round((row.completed / row.total) * 100);

  return { ...row, completionPercentage, today };
}
