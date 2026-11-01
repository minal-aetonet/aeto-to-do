import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../lib/errors';
import { clearSessionCookie, requireAuth, SESSION_COOKIE, setSessionCookie } from '../middleware/auth';
import { validate } from '../middleware/validate';
import * as authService from '../services/auth.service';
import type { AppEnv } from '../types';
import { loginSchema, registerSchema } from '../validators/auth.validator';

// Mounted at /api/auth in app.ts. Register and login are public (you cannot be
// logged in before logging in!); /me is protected by requireAuth.
export const authRoutes = new Hono<AppEnv>();

// POST /api/auth/register  (body: { name, email, password })
// Creates the account AND logs it in straight away.
authRoutes.post('/register', validate('json', registerSchema), async (c) => {
  const db = c.get('db');
  const user = await authService.registerUser(db, c.req.valid('json'));
  const session = authService.createSession(db, user.id);
  setSessionCookie(c, session.token, session.expiresAt);
  return c.json({ data: user }, 201);
});

// POST /api/auth/login  (body: { email, password })
authRoutes.post('/login', validate('json', loginSchema), async (c) => {
  const db = c.get('db');
  const { email, password } = c.req.valid('json');
  const throttle = c.get('auth').loginThrottle;

  if (throttle.isBlocked(email)) {
    throw new AppError('Too many failed login attempts. Please try again in 15 minutes.', 429, 'TOO_MANY_ATTEMPTS');
  }

  const user = await authService.authenticate(db, email, password);
  if (!user) {
    throttle.recordFailure(email);
    // Same message for "no such email" and "wrong password" (see authenticate()).
    throw new AppError('Incorrect email or password.', 401, 'INVALID_CREDENTIALS');
  }

  throttle.reset(email);
  const session = authService.createSession(db, user.id);
  setSessionCookie(c, session.token, session.expiresAt);
  return c.json({ data: user });
});

// POST /api/auth/logout
// Works even when not logged in, so the browser can always clear its cookie.
authRoutes.post('/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) authService.deleteSession(c.get('db'), token);
  clearSessionCookie(c);
  return c.body(null, 204);
});

// GET /api/auth/me — who is logged in? (401 if nobody)
authRoutes.get('/me', requireAuth, (c) => {
  return c.json({ data: c.get('user') });
});
