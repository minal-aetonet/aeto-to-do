import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runMigrations, type AppDatabase } from '../src/db';
import * as schema from '../src/db/schema';

const MIGRATIONS = join(import.meta.dirname, '..', 'src', 'db', 'migrations');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A migrations folder containing only the first `count` migrations. */
function partialMigrationsFolder(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'hono-todo-mig-'));
  tempDirs.push(dir);
  mkdirSync(join(dir, 'meta'));
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'));
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(join(dir, 'meta', '_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(join(MIGRATIONS, `${entry.tag}.sql`), join(dir, `${entry.tag}.sql`));
  return dir;
}

describe('upgrading an existing database', () => {
  it('keeps every task owner as creator and assignee (regression: table rebuild must not cascade-delete)', () => {
    // 1. A database exactly as it was after Development Entry #3 (migrations 0000 + 0001).
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle({ client: sqlite, schema }) as AppDatabase;
    migrate(db, { migrationsFolder: partialMigrationsFolder(2) });
    sqlite.exec(`
      INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (1, 'Old', 'old@example.com', 'x', 'admin', 't');
      INSERT INTO tasks (id, user_id, title, created_at, updated_at) VALUES (1, 1, 'Old task', 't', 't');
      INSERT INTO tasks (id, user_id, title, created_at, updated_at) VALUES (2, NULL, 'Ownerless', 't', 't');
    `);

    // 2. Apply the newer migrations the normal way.
    runMigrations(db);

    // 3. Nothing was lost.
    expect(sqlite.prepare('SELECT task_id, user_id FROM task_assignees').all()).toEqual([{ task_id: 1, user_id: 1 }]);
    expect(sqlite.prepare('SELECT id, created_by FROM tasks ORDER BY id').all()).toEqual([
      { id: 1, created_by: 1 },
      { id: 2, created_by: null },
    ]);
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1); // switched back on
    sqlite.close();
  });
});
