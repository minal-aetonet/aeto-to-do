import { createMiddleware } from 'hono/factory';

/**
 * Logging middleware: prints one line per request, for example
 *   GET /api/tasks -> 200 (3.4 ms)
 *
 * Everything before "await next()" runs on the way IN (before the route),
 * everything after it runs on the way OUT (after the response was created).
 */
export function requestLogger(options: { enabled: boolean }) {
  return createMiddleware(async (c, next) => {
    if (!options.enabled) {
      await next();
      return;
    }

    const start = performance.now();
    await next();
    const durationMs = (performance.now() - start).toFixed(1);
    console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${durationMs} ms)`);
  });
}
