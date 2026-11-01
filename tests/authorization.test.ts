import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

describe('protected routes need a login', () => {
  const routes: [string, string, object?][] = [
    ['GET', '/api/tasks'],
    ['GET', '/api/tasks/1'],
    ['POST', '/api/tasks', { title: 'X' }],
    ['PATCH', '/api/tasks/1', { title: 'X' }],
    ['DELETE', '/api/tasks/1'],
    ['POST', '/api/tasks/1/complete'],
    ['GET', '/api/categories'],
    ['POST', '/api/categories', { name: 'X' }],
    ['GET', '/api/dashboard'],
    ['GET', '/api/admin/users'],
  ];

  for (const [method, path, body] of routes) {
    it(`${method} ${path} -> 401 when logged out`, async () => {
      const res = await api.client().request(method, path, body);
      expect(res.status).toBe(401);
      expect(res.json.error.code).toBe('UNAUTHORIZED');
    });
  }
});

describe('users only see and change their own data', () => {
  it('keeps task lists, single tasks and dashboards separate', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });

    const aliceTask = (await alice.request('POST', '/api/tasks', { title: 'Alice secret' })).json.data;
    await bob.request('POST', '/api/tasks', { title: 'Bob task' });

    const bobList = (await bob.request('GET', '/api/tasks')).json.data;
    expect(bobList.map((t: { title: string }) => t.title)).toEqual(['Bob task']);

    expect((await bob.request('GET', '/api/dashboard')).json.data.total).toBe(1);
    expect((await alice.request('GET', '/api/dashboard')).json.data.total).toBe(1);

    // Bob guesses Alice's task ID: it looks as if it does not exist at all.
    expect((await bob.request('GET', `/api/tasks/${aliceTask.id}`)).status).toBe(404);
  });

  it("does not let a user edit, complete, reopen or delete someone else's task", async () => {
    const alice = await api.registerClient();
    const bob = await api.registerClient();
    const { id } = (await alice.request('POST', '/api/tasks', { title: 'Alice task' })).json.data;

    expect((await bob.request('PATCH', `/api/tasks/${id}`, { title: 'Hacked' })).status).toBe(404);
    expect((await bob.request('POST', `/api/tasks/${id}/complete`)).status).toBe(404);
    expect((await bob.request('POST', `/api/tasks/${id}/reopen`)).status).toBe(404);
    expect((await bob.request('DELETE', `/api/tasks/${id}`)).status).toBe(404);

    const still = (await alice.request('GET', `/api/tasks/${id}`)).json.data;
    expect(still).toMatchObject({ title: 'Alice task', status: 'pending' });
  });

  it("keeps categories separate and blocks using someone else's category", async () => {
    const alice = await api.registerClient();
    const bob = await api.registerClient();
    const aliceCat = (await alice.request('POST', '/api/categories', { name: 'Work' })).json.data;

    // Both users may own a category with the same name.
    expect((await bob.request('POST', '/api/categories', { name: 'Work' })).status).toBe(201);
    expect((await bob.request('GET', '/api/categories')).json.data).toHaveLength(1);

    // Bob cannot put his task into Alice's category, rename it or delete it.
    const res = await bob.request('POST', '/api/tasks', { title: 'X', categoryId: aliceCat.id });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_CATEGORY');
    expect((await bob.request('PATCH', `/api/categories/${aliceCat.id}`, { name: 'Mine' })).status).toBe(404);
    expect((await bob.request('DELETE', `/api/categories/${aliceCat.id}`)).status).toBe(404);
  });
});

describe('admin-only routes', () => {
  it('returns 403 for a normal user', async () => {
    const normal = await api.registerClient();
    const res = await normal.request('GET', '/api/admin/users');
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('FORBIDDEN');
  });

  it('lists users with task counts for an admin, without password hashes', async () => {
    const normal = await api.registerClient({ name: 'Normal' });
    await normal.request('POST', '/api/tasks', { title: 'A' });

    const res = await api.request('GET', '/api/admin/users'); // default user = admin
    expect(res.status).toBe(200);
    expect(res.json.data.map((u: { name: string; role: string; taskCount: number }) => [u.name, u.role, u.taskCount])).toEqual([
      ['Default User', 'admin', 0],
      ['Normal', 'user', 1],
    ]);
    expect(JSON.stringify(res.json)).not.toContain('scrypt');
  });
});
