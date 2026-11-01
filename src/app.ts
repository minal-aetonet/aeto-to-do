import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import type { AppDatabase } from './db';
import { AppError } from './lib/errors';
import { LoginThrottle } from './lib/login-throttle';
import { injectAuthSettings } from './middleware/auth';
import { injectDatabase } from './middleware/database';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { adminRoutes } from './routes/admin.routes';
import { authRoutes } from './routes/auth.routes';
import { categoryRoutes } from './routes/category.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { subtaskRoutes } from './routes/subtask.routes';
import { taskRoutes } from './routes/task.routes';
import type { AppEnv } from './types';

export type CreateAppOptions = {
  db: AppDatabase;
  logRequests?: boolean;
  serveFrontend?: boolean;
  /** Send the session cookie only over HTTPS (true in production). */
  secureCookies?: boolean;
};

/**
 * Builds the whole Hono application: middleware, API routes, the static
 * frontend and the error handlers. It does NOT start a server; index.ts does
 * that. Keeping the two apart lets tests call the app directly.
 */
export function createApp({ db, logRequests = true, serveFrontend = true, secureCookies = false }: CreateAppOptions) {
  const app = new Hono<AppEnv>();
  // One throttle per app: remembers failed logins while the server runs.
  const loginThrottle = new LoginThrottle();

  // ---- Middleware (runs in the order it is registered) ----
  app.use('*', requestLogger({ enabled: logRequests }));
  app.use(
    '*',
    secureHeaders({
      // Content Security Policy: the browser may only load scripts, styles
      // and other resources from our own server. This blocks many XSS attacks.
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  // CSRF protection: refuses state-changing requests (POST, PATCH, DELETE)
  // without a body or with a form body that were sent from another website.
  app.use('/api/*', csrf());
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 100 * 1024, // 100 KB is plenty for a to-do item
      onError: () => {
        throw new AppError('The request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
      },
    }),
  );
  app.use('/api/*', injectDatabase(db));
  app.use('/api/*', injectAuthSettings({ secureCookies, loginThrottle }));

  // ---- API routes ----
  // Public: health check and auth (register/login/logout).
  // Protected: everything else (each route group uses requireAuth itself).
  app.get('/api/health', (c) => c.json({ data: { status: 'ok' } }));
  app.route('/api/auth', authRoutes);
  app.route('/api/tasks', taskRoutes);
  app.route('/api/categories', categoryRoutes);
  app.route('/api/subtasks', subtaskRoutes);
  app.route('/api/dashboard', dashboardRoutes);
  app.route('/api/admin', adminRoutes);

  // ---- Frontend: files in the "public" folder (index.html, css, js) ----
  if (serveFrontend) {
    app.use('/*', serveStatic({ root: './public' }));
  }

  // ---- Error handling ----
  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
