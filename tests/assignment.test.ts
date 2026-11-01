import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

// The default test user (api.request) registered first, so it is the ADMIN.
let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

const names = (task: { assignees: { name: string }[] }) => task.assignees.map((a) => a.name);
const titles = (res: { json: { data: { title: string }[] } }) => res.json.data.map((t) => t.title);

describe('individual tasks', () => {
  it('a task without assigneeIds is assigned to its creator only', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const task = (await alice.request('POST', '/api/tasks', { title: 'Mine' })).json.data;
    expect(names(task)).toEqual(['Alice']);
    expect(task.isGroup).toBe(false);
  });

  it('a normal user cannot assign a task to someone else', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const res = await alice.request('POST', '/api/tasks', { title: 'X', assigneeIds: [api.user.id] });
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe('FORBIDDEN');
  });
});

describe('admin assigns tasks', () => {
  it('assigns an individual task to a user, who then sees it', async () => {
    const bob = await api.registerClient({ name: 'Bob' });
    const res = await api.request('POST', '/api/tasks', { title: 'For Bob', assigneeIds: [bob.user.id] });
    expect(res.status).toBe(201);
    expect(names(res.json.data)).toEqual(['Bob']);

    expect(titles(await bob.request('GET', '/api/tasks'))).toEqual(['For Bob']);
    // The admin created it but is not assigned, so it is not in the admin's own list…
    expect(titles(await api.request('GET', '/api/tasks'))).toEqual([]);
    // …but the admin can still open it.
    expect((await api.request('GET', `/api/tasks/${res.json.data.id}`)).status).toBe(200);
  });

  it('creates a GROUP task that every member sees and can complete', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });
    const carol = await api.registerClient({ name: 'Carol' });

    const task = (
      await api.request('POST', '/api/tasks', { title: 'Team plan', assigneeIds: [alice.user.id, bob.user.id] })
    ).json.data;
    expect(task.isGroup).toBe(true);
    expect(names(task)).toEqual(['Alice', 'Bob']);

    expect(titles(await alice.request('GET', '/api/tasks'))).toEqual(['Team plan']);
    expect(titles(await bob.request('GET', '/api/tasks'))).toEqual(['Team plan']);
    expect(titles(await carol.request('GET', '/api/tasks'))).toEqual([]);
    expect((await carol.request('GET', `/api/tasks/${task.id}`)).status).toBe(404);

    // Bob completes it; Alice sees the same task as completed (shared progress).
    expect((await bob.request('POST', `/api/tasks/${task.id}/complete`)).status).toBe(200);
    expect((await alice.request('GET', `/api/tasks/${task.id}`)).json.data.status).toBe('completed');
  });

  it('lets an admin change the assignees, but not a normal member', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });
    const task = (await api.request('POST', '/api/tasks', { title: 'T', assigneeIds: [alice.user.id] })).json.data;

    const byAlice = await alice.request('PATCH', `/api/tasks/${task.id}`, { assigneeIds: [alice.user.id, bob.user.id] });
    expect(byAlice.status).toBe(403);

    const byAdmin = await api.request('PATCH', `/api/tasks/${task.id}`, { assigneeIds: [bob.user.id] });
    expect(byAdmin.status).toBe(200);
    expect(names(byAdmin.json.data)).toEqual(['Bob']);
    expect((await alice.request('GET', `/api/tasks/${task.id}`)).status).toBe(404); // removed
  });

  it('rejects assignees that do not exist, or an empty list', async () => {
    const missing = await api.request('POST', '/api/tasks', { title: 'T', assigneeIds: [999] });
    expect(missing.status).toBe(400);
    expect(missing.json.error.code).toBe('INVALID_ASSIGNEE');

    const empty = await api.request('POST', '/api/tasks', { title: 'T', assigneeIds: [] });
    expect(empty.status).toBe(400);
  });

  it('counts group tasks on the dashboard', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    await api.request('POST', '/api/tasks', { title: 'Group', assigneeIds: [api.user.id, alice.user.id] });
    await api.request('POST', '/api/tasks', { title: 'Solo' });
    const stats = (await api.request('GET', '/api/dashboard')).json.data;
    expect(stats.total).toBe(2);
    expect(stats.groupTasks).toBe(1);
  });

  it('filters by kind: individual or group', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    await api.request('POST', '/api/tasks', { title: 'Group', assigneeIds: [api.user.id, alice.user.id] });
    await api.request('POST', '/api/tasks', { title: 'Solo' });
    expect(titles(await api.request('GET', '/api/tasks?kind=group'))).toEqual(['Group']);
    expect(titles(await api.request('GET', '/api/tasks?kind=individual'))).toEqual(['Solo']);
  });
});

describe('who created a task is visible only to admins', () => {
  it('admins get createdBy; normal users never do', async () => {
    const bob = await api.registerClient({ name: 'Bob' });
    const created = (await api.request('POST', '/api/tasks', { title: 'T', assigneeIds: [bob.user.id] })).json.data;

    expect(created.createdBy).toMatchObject({ id: api.user.id, name: 'Default User' });

    const asBob = (await bob.request('GET', `/api/tasks/${created.id}`)).json.data;
    expect(asBob).not.toHaveProperty('createdBy');
    expect(asBob).not.toHaveProperty('createdById');
  });
});

describe('deleting', () => {
  it('only the creator or an admin may delete a task', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });
    const group = (
      await api.request('POST', '/api/tasks', { title: 'G', assigneeIds: [alice.user.id, bob.user.id] })
    ).json.data;

    expect((await bob.request('GET', `/api/tasks/${group.id}`)).json.data.canDelete).toBe(false);
    expect((await bob.request('DELETE', `/api/tasks/${group.id}`)).status).toBe(403); // member, not creator
    expect((await api.request('DELETE', `/api/tasks/${group.id}`)).status).toBe(204); // admin

    const own = (await alice.request('POST', '/api/tasks', { title: 'Own' })).json.data;
    expect(own.canDelete).toBe(true);
    expect((await alice.request('DELETE', `/api/tasks/${own.id}`)).status).toBe(204); // creator
  });
});

describe('admin task overview: GET /api/admin/tasks', () => {
  it('lists every task with assignees and creator, filterable by assignee', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });
    await alice.request('POST', '/api/tasks', { title: 'Alice own' });
    await bob.request('POST', '/api/tasks', { title: 'Bob own' });

    const all = await api.request('GET', '/api/admin/tasks?sort=title&order=asc');
    expect(all.status).toBe(200);
    expect(titles(all)).toEqual(['Alice own', 'Bob own']);
    expect(all.json.data[0].createdBy.name).toBe('Alice');

    expect(titles(await api.request('GET', `/api/admin/tasks?assigneeId=${bob.user.id}`))).toEqual(['Bob own']);
  });

  it('is forbidden for normal users', async () => {
    const alice = await api.registerClient();
    expect((await alice.request('GET', '/api/admin/tasks')).status).toBe(403);
  });
});

describe('calendar range: dueFrom / dueTo', () => {
  it('returns only tasks due inside the range', async () => {
    await api.request('POST', '/api/tasks', { title: 'Oct', dueDate: '2026-10-31' });
    await api.request('POST', '/api/tasks', { title: 'Nov 1', dueDate: '2026-11-01' });
    await api.request('POST', '/api/tasks', { title: 'Nov 30', dueDate: '2026-11-30' });
    await api.request('POST', '/api/tasks', { title: 'No date' });
    const res = await api.request('GET', '/api/tasks?dueFrom=2026-11-01&dueTo=2026-11-30&sort=dueDate&order=asc');
    expect(titles(res)).toEqual(['Nov 1', 'Nov 30']);
  });
});

describe('categories on shared tasks', () => {
  it('a group member can edit a task that keeps the creator’s category', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const cat = (await api.request('POST', '/api/categories', { name: 'Admin stuff' })).json.data;
    const task = (
      await api.request('POST', '/api/tasks', { title: 'T', categoryId: cat.id, assigneeIds: [alice.user.id] })
    ).json.data;

    // Alice sends the unchanged categoryId with her edit: allowed.
    const edit = await alice.request('PATCH', `/api/tasks/${task.id}`, { title: 'Renamed', categoryId: cat.id });
    expect(edit.status).toBe(200);
    expect(edit.json.data.category.name).toBe('Admin stuff');

    // But she cannot pick another of the admin's categories.
    const other = (await api.request('POST', '/api/categories', { name: 'Other' })).json.data;
    expect((await alice.request('PATCH', `/api/tasks/${task.id}`, { categoryId: other.id })).status).toBe(400);
  });
});
