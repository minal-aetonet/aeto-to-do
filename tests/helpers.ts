import { createApp } from '../src/app';
import { createDatabase, runMigrations } from '../src/db';

export type TestResponse = { status: number; headers: Headers; json: any; setCookie: string[] }; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Creates a fresh app with its own empty in-memory database.
 * Nothing is written to disk and every test starts from a clean slate.
 *
 * Returns:
 *  - request(): sends requests as a default user that is ALREADY logged in
 *    (the first account, so it is an admin)
 *  - client():  a new, logged-out "browser" with its own cookie jar
 *  - registerClient(): a new client that registers and logs in
 */
export async function createTestApp(options: { serveFrontend?: boolean } = {}) {
  const db = createDatabase(':memory:');
  runMigrations(db);
  const app = createApp({ db, logRequests: false, serveFrontend: options.serveFrontend ?? false });

  /** A pretend browser: remembers the session cookie between requests. */
  function client() {
    let cookie = '';

    async function request(method: string, path: string, body?: unknown): Promise<TestResponse> {
      const headers: Record<string, string> = {
        // Browsers send Origin on POST/PATCH/DELETE; the CSRF middleware checks it.
        Origin: 'http://localhost',
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (cookie) headers.Cookie = cookie;

      const response = await app.request(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      // Remember (or forget) the session cookie, exactly like a browser.
      const setCookie = response.headers.getSetCookie();
      for (const line of setCookie) {
        const [pair] = line.split(';');
        const [name, value] = pair.split('=');
        if (name === 'session') cookie = value ? `session=${value}` : '';
      }

      const text = await response.text();
      return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null, setCookie };
    }

    return {
      request,
      get cookie() {
        return cookie;
      },
      setCookie(value: string) {
        cookie = value;
      },
    };
  }

  let userCounter = 0;
  /** Registers a new account in a new client and returns the logged-in client. */
  async function registerClient(details: { name?: string; email?: string; password?: string } = {}) {
    userCounter++;
    const browser = client();
    const res = await browser.request('POST', '/api/auth/register', {
      name: details.name ?? `User ${userCounter}`,
      email: details.email ?? `user${userCounter}@example.com`,
      password: details.password ?? 'correct-horse-battery',
    });
    if (res.status !== 201) throw new Error(`registration failed: ${JSON.stringify(res.json)}`);
    return Object.assign(browser, { user: res.json.data });
  }

  const defaultUser = await registerClient({ name: 'Default User', email: 'default@example.com' });

  return { app, db, request: defaultUser.request, user: defaultUser.user, client, registerClient };
}
