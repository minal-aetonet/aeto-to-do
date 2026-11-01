import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

// The type of our database object. Services receive this as a parameter.
// $client is the raw better-sqlite3 connection that Drizzle wraps.
export type AppDatabase = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

// Absolute path to the folder with the SQL migration files,
// calculated relative to this file so it works from any working directory.
const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Opens (or creates) a SQLite database file and wraps it with Drizzle ORM.
 * Pass ":memory:" to get a temporary in-memory database (used by tests).
 */
export function createDatabase(filePath: string): AppDatabase {
  if (filePath !== ':memory:') {
    // Make sure the folder (e.g. "./data") exists before SQLite creates the file.
    mkdirSync(dirname(filePath), { recursive: true });
  }

  const sqlite = new Database(filePath);
  // WAL mode lets reads and writes happen at the same time more smoothly.
  sqlite.pragma('journal_mode = WAL');
  // SQLite does NOT enforce foreign keys unless we switch them on.
  sqlite.pragma('foreign_keys = ON');

  return drizzle({ client: sqlite, schema });
}

/**
 * Applies any migrations that have not been applied to this database yet.
 *
 * Foreign-key enforcement is switched OFF while migrating. Some migrations
 * rebuild a table (create a new copy, drop the old one, rename). With foreign
 * keys ON, dropping the old table would fire "ON DELETE CASCADE" and silently
 * delete rows in other tables that point at it. The PRAGMA has to be set here,
 * outside the transaction Drizzle wraps around the migrations, because SQLite
 * ignores it inside a transaction.
 */
export function runMigrations(db: AppDatabase): void {
  const sqlite = db.$client;
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    // Make sure every foreign key still points at an existing row.
    const problems = sqlite.pragma('foreign_key_check') as unknown[];
    if (problems.length > 0) {
      throw new Error(`Migration left ${problems.length} broken foreign key reference(s).`);
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

/** Closes the underlying SQLite connection. */
export function closeDatabase(db: AppDatabase): void {
  db.$client.close();
}
