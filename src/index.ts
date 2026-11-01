import { serve } from '@hono/node-server';
import { createApp } from './app';
import { config } from './config';
import { closeDatabase, createDatabase, runMigrations } from './db';

// 1. Open the database file and bring its tables up to date.
const db = createDatabase(config.databasePath);
runMigrations(db);

// 2. Build the Hono application.
const app = createApp({ db, logRequests: config.logRequests, secureCookies: config.secureCookies });

// 3. Start a Node.js HTTP server that hands every request to app.fetch.
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`To-Do app running at http://localhost:${info.port}`);
  console.log(`Database file: ${config.databasePath}`);
});

// 4. When you press Ctrl+C, stop the server and close the database cleanly.
function shutdown() {
  console.log('\nShutting down...');
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
