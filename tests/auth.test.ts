import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../src/db';
import { sessions, taskAssignees, tasks, users } from '../src/db/schema';
import { registerUser } from '../src/services/auth.service';
import { createTestApp } from './helpers';

let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

const register = (body: object) => api.client().request('POST', '/api/auth/register', body);

describe('registration', () => {
  it('creates an account, logs it in and never returns the password hash', async () => {
    const res = await register({ name: 'Sam', email: '  Sam@Example.COM ', password: 'long-enough-pw' });

    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({ name: 'Sam', email: 'sam@example.com', role: 'user' });
    expect(res.json.data.passwordHash).toBeUndefined();

    const cookie = res.setCookie.find((line) => line.startsWith('session='))!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
  });

  it('stores a scrypt hash, not the password', async () => {
    await register({ name: 'Sam', email: 'sam@example.com', password: 'long-enough-pw' });
    const row = api.db.select().from(users).where(eq(users.email, 'sam@example.com')).get()!;
    expect(row.passwordHash).not.toContain('long-enough-pw');
    expect(row.passwordHash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('rejects a duplicate email, ignoring letter case', async () => {
    const res = await register({ name: 'Copy', email: 'DEFAULT@example.com', password: 'long-enough-pw' });
    expect(res.status).toBe(409);
  });

  it('validates name, email and password length', async () => {
    const res = await register({ name: '', email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    const fields = res.json.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('makes only the first account an admin', async () => {
    expect(api.user.role).toBe('admin'); // the default test user registered first
    const second = await api.registerClient();
    expect(second.user.role).toBe('user');
  });
});

describe('login and logout', () => {
  it('logs in with the right password', async () => {
    const browser = api.client();
    const res = await browser.request('POST', '/api/auth/login', { email: 'default@example.com', password: 'correct-horse-battery' });
    expect(res.status).toBe(200);
    expect(res.json.data.email).toBe('default@example.com');
    expect((await browser.request('GET', '/api/auth/me')).status).toBe(200);
  });

  it('gives the same 401 message for a wrong password and an unknown email', async () => {
    const wrongPassword = await api.client().request('POST', '/api/auth/login', { email: 'default@example.com', password: 'nope-nope' });
    const unknownEmail = await api.client().request('POST', '/api/auth/login', { email: 'nobody@example.com', password: 'nope-nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.json.error).toEqual(unknownEmail.json.error);
  });

  it('locks an email for a while after 5 failed attempts', async () => {
    const attempt = (password: string) =>
      api.client().request('POST', '/api/auth/login', { email: 'default@example.com', password });
    for (let i = 0; i < 5; i++) {
      expect((await attempt('wrong-password')).status).toBe(401);
    }
    const blocked = await attempt('correct-horse-battery'); // even the right password
    expect(blocked.status).toBe(429);
    expect(blocked.json.error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('GET /api/auth/me returns the user, or 401 without a session', async () => {
    expect((await api.request('GET', '/api/auth/me')).json.data.name).toBe('Default User');
    const anonymous = await api.client().request('GET', '/api/auth/me');
    expect(anonymous.status).toBe(401);
    expect(anonymous.json.error.code).toBe('UNAUTHORIZED');
  });

  it('logout deletes the session so the old cookie stops working', async () => {
    const browser = await api.registerClient();
    const oldCookie = browser.cookie;

    const res = await browser.request('POST', '/api/auth/logout');
    expect(res.status).toBe(204);
    expect(browser.cookie).toBe(''); // the browser was told to delete the cookie

    browser.setCookie(oldCookie); // an attacker re-using the old cookie
    expect((await browser.request('GET', '/api/auth/me')).status).toBe(401);
  });

  it('rejects an expired session', async () => {
    const browser = await api.registerClient();
    api.db.update(sessions).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).run();
    expect((await browser.request('GET', '/api/tasks')).status).toBe(401);
  });

  it('rejects a made-up session token', async () => {
    const browser = api.client();
    browser.setCookie('session=made-up-token');
    expect((await browser.request('GET', '/api/tasks')).status).toBe(401);
  });

  it('stores only a hash of the session token in the database', async () => {
    const browser = await api.registerClient();
    const token = browser.cookie.replace('session=', '');
    const stored = api.db.select({ id: sessions.id }).from(sessions).all().map((s) => s.id);
    expect(stored).not.toContain(token);
    expect(stored.every((id) => /^[0-9a-f]{64}$/.test(id))).toBe(true);
  });
});

describe('data created before accounts existed (user_id is NULL)', () => {
  it('is claimed by the first account that registers', async () => {
    // A database from version 1: one task, no users yet.
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.insert(tasks).values({ title: 'Old task', createdAt: 'x', updatedAt: 'x' }).run();

    const first = await registerUser(db, { name: 'First', email: 'first@example.com', password: 'long-enough-pw' });
    const second = await registerUser(db, { name: 'Second', email: 'second@example.com', password: 'long-enough-pw' });

    expect(db.select().from(taskAssignees).all()).toMatchObject([{ userId: first.id }]);
    expect(db.select().from(tasks).get()!.createdById).toBe(first.id);
    expect(first.role).toBe('admin');
    expect(second.role).toBe('user');
  });

  it('is invisible to everyone while it has no owner', async () => {
    api.db.insert(tasks).values({ title: 'Ownerless', createdAt: 'x', updatedAt: 'x' }).run();
    expect((await api.request('GET', '/api/tasks')).json.data).toHaveLength(0);
  });
});
