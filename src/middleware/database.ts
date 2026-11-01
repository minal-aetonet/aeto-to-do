import { createMiddleware } from 'hono/factory';
import type { AppDatabase } from '../db';
import type { AppEnv } from '../types';

/**
 * Puts the database object on the context so every route handler can get it
 * with c.get('db'). Passing the database in (instead of importing a global)
 * lets the tests give the app a fresh in-memory database.
 */
export function injectDatabase(db: AppDatabase) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('db', db);
    await next();
  });
}
