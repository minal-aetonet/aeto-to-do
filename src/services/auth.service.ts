import { createHash, randomBytes } from 'node:crypto';
import { and, asc, count, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db';
import { categories, sessions, taskAssignees, tasks, users, type User } from '../db/schema';
import { nowIso } from '../lib/dates';
import { ConflictError } from '../lib/errors';
import { hashPassword, verifyPassword } from '../lib/password';
import type { RegisterInput } from '../validators/auth.validator';

/** How long a login lasts: 7 days, in milliseconds. */
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A user as the API shows it. The password hash is NEVER included. */
export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role' | 'createdAt'>;

function toPublicUser(user: User): PublicUser {
  return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

/** The database stores only the SHA-256 hash of a session token, never the token itself. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a new account.
 * The very first account becomes an "admin" and takes ownership of any tasks
 * and categories that were created before accounts existed.
 */
export async function registerUser(db: AppDatabase, input: RegisterInput): Promise<PublicUser> {
  const existing = db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get();
  if (existing) {
    throw new ConflictError('An account with this email already exists.');
  }

  // Hashing is slow on purpose, so we do it before opening the transaction.
  const passwordHash = await hashPassword(input.password);

  // A transaction: either ALL of these changes are saved, or none of them.
  return db.transaction((tx) => {
    const isFirstUser = tx.select({ value: count() }).from(users).get()!.value === 0;
    const user = tx
      .insert(users)
      .values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: isFirstUser ? 'admin' : 'user',
        createdAt: nowIso(),
      })
      .returning()
      .get();

    if (isFirstUser) {
      // Tasks with nobody assigned (from before accounts existed) go to the first user.
      const ownerless = tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(sql`${tasks.id} NOT IN (SELECT ${taskAssignees.taskId} FROM ${taskAssignees})`)
        .all();
      if (ownerless.length > 0) {
        const assignedAt = nowIso();
        tx.insert(taskAssignees)
          .values(ownerless.map((task) => ({ taskId: task.id, userId: user.id, assignedAt })))
          .run();
      }
      tx.update(tasks).set({ createdById: user.id }).where(isNull(tasks.createdById)).run();
      tx.update(categories).set({ userId: user.id }).where(isNull(categories.userId)).run();
    }
    return toPublicUser(user);
  });
}

/**
 * Checks an email + password. Returns the user when correct, otherwise null.
 * The caller shows the SAME message for "unknown email" and "wrong password",
 * so attackers cannot find out which emails have accounts.
 */
export async function authenticate(db: AppDatabase, email: string, password: string): Promise<PublicUser | null> {
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    // Do the same slow work as a real check, so the response time does not
    // reveal that this email has no account.
    await hashPassword(password);
    return null;
  }
  const valid = await verifyPassword(password, user.passwordHash);
  return valid ? toPublicUser(user) : null;
}

/**
 * Starts a session for a user and returns the secret token for the cookie.
 * The token is 32 random bytes: impossible to guess.
 */
export function createSession(db: AppDatabase, userId: number): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  // Housekeeping: remove sessions that have already expired.
  db.delete(sessions).where(lte(sessions.expiresAt, nowIso())).run();

  db.insert(sessions)
    .values({ id: hashToken(token), userId, expiresAt: expiresAt.toISOString(), createdAt: nowIso() })
    .run();
  return { token, expiresAt };
}

/** Finds the user who owns a (not expired) session token, or null. */
export function getUserBySessionToken(db: AppDatabase, token: string): PublicUser | null {
  const row = db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, nowIso())))
    .get();
  return row ? toPublicUser(row.user) : null;
}

/** Ends a session (logout). Unknown tokens are simply ignored. */
export function deleteSession(db: AppDatabase, token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

export type UserWithTaskCount = PublicUser & { taskCount: number };

/** Every account with its number of tasks. Admin only (checked by the route). */
export function listUsers(db: AppDatabase): UserWithTaskCount[] {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      taskCount: count(taskAssignees.taskId), // tasks assigned to the user
    })
    .from(users)
    .leftJoin(taskAssignees, eq(taskAssignees.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.id))
    .all();
}
