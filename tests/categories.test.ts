import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

describe('categories API', () => {
  it('creates a category with a default color', async () => {
    const res = await api.request('POST', '/api/categories', { name: 'Home' });
    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({ id: 1, name: 'Home', color: '#6366f1' });
  });

  it('rejects duplicate names, ignoring letter case', async () => {
    await api.request('POST', '/api/categories', { name: 'Home' });
    const res = await api.request('POST', '/api/categories', { name: 'HOME' });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('CONFLICT');
  });

  it('rejects an invalid color', async () => {
    const res = await api.request('POST', '/api/categories', { name: 'Home', color: 'red' });
    expect(res.status).toBe(400);
  });

  it('lists categories alphabetically with task counts', async () => {
    await api.request('POST', '/api/categories', { name: 'work' });
    await api.request('POST', '/api/categories', { name: 'Home' });
    await api.request('POST', '/api/tasks', { title: 'A', categoryId: 1 });
    await api.request('POST', '/api/tasks', { title: 'B', categoryId: 1 });

    const res = await api.request('GET', '/api/categories');
    expect(res.json.data.map((c: { name: string; taskCount: number }) => [c.name, c.taskCount])).toEqual([
      ['Home', 0],
      ['work', 2],
    ]);
  });

  it('renames and recolors a category', async () => {
    await api.request('POST', '/api/categories', { name: 'Home' });
    const res = await api.request('PATCH', '/api/categories/1', { name: 'House', color: '#00ff00' });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ name: 'House', color: '#00ff00' });
  });

  it('allows renaming a category to a different letter case of its own name', async () => {
    await api.request('POST', '/api/categories', { name: 'home' });
    const res = await api.request('PATCH', '/api/categories/1', { name: 'Home' });
    expect(res.status).toBe(200);
  });

  it('deleting a category keeps its tasks but makes them uncategorized', async () => {
    await api.request('POST', '/api/categories', { name: 'Home' });
    await api.request('POST', '/api/tasks', { title: 'Clean', categoryId: 1 });

    const res = await api.request('DELETE', '/api/categories/1');
    expect(res.status).toBe(204);

    const task = await api.request('GET', '/api/tasks/1');
    expect(task.json.data.categoryId).toBeNull();
    expect(task.json.data.category).toBeNull();
  });

  it('returns 404 when deleting a missing category', async () => {
    const res = await api.request('DELETE', '/api/categories/9');
    expect(res.status).toBe(404);
  });
});
