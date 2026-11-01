import { existsSync } from 'node:fs';
import { z } from 'zod';

// Node.js 22+ can read a ".env" file by itself. If the file exists, its
// KEY=value lines are copied into process.env.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

// Describe what each environment variable must look like.
// z.coerce.number() turns the text "3000" into the number 3000.
const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/todo.db'),
  LOG_REQUESTS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  // Set to "true" when the site is served over HTTPS (always in production),
  // so the browser never sends the session cookie over an unencrypted connection.
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

// Validate once at startup. If something is wrong we stop immediately with a
// clear message instead of failing in a confusing way later.
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const config = {
  port: parsed.data.PORT,
  databasePath: parsed.data.DATABASE_PATH,
  logRequests: parsed.data.LOG_REQUESTS,
  secureCookies: parsed.data.COOKIE_SECURE,
};
