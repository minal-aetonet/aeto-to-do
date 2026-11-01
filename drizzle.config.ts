import { defineConfig } from 'drizzle-kit';

// Configuration for drizzle-kit, the command-line tool that compares our
// schema (src/db/schema.ts) with previous migrations and writes new SQL
// migration files into src/db/migrations. Run it with: pnpm db:generate
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
