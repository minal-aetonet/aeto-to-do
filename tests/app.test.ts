import { describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

describe('application-wide behaviour', () => {
  it('responds to the health check without logging in', async () => {
    const api = await createTestApp();
    const res = await api.client().request('GET', '/api/health');
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ data: { status: 'ok' } });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await (await createTestApp()).request('GET', '/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('NOT_FOUND');
  });

  it('adds security headers to every response', async () => {
    const res = await (await createTestApp()).request('GET', '/api/health');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects request bodies larger than 100 KB', async () => {
    const api = await createTestApp();
    const res = await api.request('POST', '/api/tasks', { title: 'x', description: 'a'.repeat(200_000) });
    expect(res.status).toBe(413);
    expect(res.json.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('blocks state-changing requests sent from another website (CSRF)', async () => {
    const api = await createTestApp();
    const browser = await api.registerClient();
    await browser.request('POST', '/api/tasks', { title: 'Mine' });

    // A form on evil.example tries to delete the task using the victim's cookie.
    const response = await api.app.request('/api/tasks/1', {
      method: 'DELETE',
      headers: { Cookie: browser.cookie, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
    expect((await browser.request('GET', '/api/tasks/1')).status).toBe(200);
  });

  it('serves the frontend files from the public folder', async () => {
    const { app } = await createTestApp({ serveFrontend: true });
    const page = await app.request('/');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Aeto To-Do</title>');

    const script = await app.request('/js/app.js');
    expect(script.status).toBe(200);
  });
});
