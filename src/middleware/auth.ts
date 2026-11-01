import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { UserRole } from '../db/schema';
import { AppError } from '../lib/errors';
import { getUserBySessionToken } from '../services/auth.service';
import type { AppEnv, AuthSettings } from '../types';

/** The name of the cookie that holds the session token. */
export const SESSION_COOKIE = 'session';

/** Puts the authentication settings on the context (like injectDatabase does for db). */
export function injectAuthSettings(settings: AuthSettings) {
  return createMiddleware<AppEnv>(async (c, next) => {
    c.set('auth', settings);
    await next();
  });
}

/**
 * AUTHENTICATION middleware: "who are you?"
 * Reads the session cookie, looks the session up in the database and stores
 * the user on the context. Without a valid session the request stops with 401.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? getUserBySessionToken(c.get('db'), token) : null;
  if (!user) {
    throw new AppError('You must be logged in to do this.', 401, 'UNAUTHORIZED');
  }
  c.set('user', user);
  await next();
});

/**
 * AUTHORIZATION middleware: "are you allowed to do this?"
 * Must run AFTER requireAuth. Stops with 403 when the user lacks the role.
 */
export function requireRole(role: UserRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('user').role !== role) {
      throw new AppError('You do not have permission to do this.', 403, 'FORBIDDEN');
    }
    await next();
  });
}

/**
 * Sends the session cookie to the browser.
 *  - httpOnly: page JavaScript cannot read it, so XSS cannot steal it.
 *  - sameSite 'Lax': the browser does not send it with requests started by other websites.
 *  - secure: only sent over HTTPS (switched on in production).
 */
export function setSessionCookie(c: Context<AppEnv>, token: string, expiresAt: Date): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.get('auth').secureCookies,
    path: '/',
    expires: expiresAt,
  });
}

/** Tells the browser to delete the session cookie. */
export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: c.get('auth').secureCookies });
}
