// Applies database migrations without starting the server: pnpm db:migrate
// (The server also runs migrations automatically every time it starts.)
import { config } from '../src/config';
import { closeDatabase, createDatabase, runMigrations } from '../src/db';

const db = createDatabase(config.databasePath);
runMigrations(db);
closeDatabase(db);
console.log(`Migrations applied to ${config.databasePath}`);
