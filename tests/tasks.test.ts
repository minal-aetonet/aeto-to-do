import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers';

let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

describe('POST /api/tasks (create)', () => {
  it('creates a task with default values', async () => {
    const res = await api.request('POST', '/api/tasks', { title: '  Buy milk  ' });

    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      id: 1,
      title: 'Buy milk', // whitespace trimmed by the validator
      description: '',
      status: 'pending',
      priority: 'medium',
      categoryId: null,
      dueDate: null,
      category: null,
    });
    expect(res.json.data.createdAt).toBe(res.json.data.updatedAt);
  });

  it('saves every field and returns the category', async () => {
    const cat = await api.request('POST', '/api/categories', { name: 'Work', color: '#ff0000' });
    const res = await api.request('POST', '/api/tasks', {
      title: 'Write report',
      description: 'Quarterly numbers',
      status: 'in_progress',
      priority: 'high',
      categoryId: cat.json.data.id,
      dueDate: '2026-12-01',
    });

    expect(res.status).toBe(201);
    expect(res.json.data).toMatchObject({
      status: 'in_progress',
      priority: 'high',
      dueDate: '2026-12-01',
      category: { id: cat.json.data.id, name: 'Work', color: '#ff0000' },
    });
  });

  it('rejects a missing title with 400 and field details', async () => {
    const res = await api.request('POST', '/api/tasks', { title: '   ' });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('VALIDATION_ERROR');
    expect(res.json.error.details).toContainEqual({ field: 'title', message: 'Title is required' });
  });

  it('rejects invalid status, priority and date', async () => {
    const res = await api.request('POST', '/api/tasks', {
      title: 'X',
      status: 'done',
      priority: 'urgent',
      dueDate: '01/12/2026',
    });
    expect(res.status).toBe(400);
    const fields = res.json.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['status', 'priority', 'dueDate']));
  });

  it('rejects a category that does not exist', async () => {
    const res = await api.request('POST', '/api/tasks', { title: 'X', categoryId: 999 });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_CATEGORY');
  });

  it('rejects a body that is not valid JSON', async () => {
    const browser = await api.registerClient();
    const response = await api.app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', Cookie: browser.cookie },
      body: '{ not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('GET /api/tasks/:id', () => {
  it('returns one task', async () => {
    await api.request('POST', '/api/tasks', { title: 'A' });
    const res = await api.request('GET', '/api/tasks/1');
    expect(res.status).toBe(200);
    expect(res.json.data.title).toBe('A');
  });

  it('returns 404 for a missing task', async () => {
    const res = await api.request('GET', '/api/tasks/42');
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an ID that is not a number', async () => {
    const res = await api.request('GET', '/api/tasks/abc');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id (edit)', () => {
  it('updates only the given fields and refreshes updatedAt', async () => {
    const created = await api.request('POST', '/api/tasks', { title: 'Old', priority: 'low' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const res = await api.request('PATCH', '/api/tasks/1', { title: 'New' });

    expect(res.status).toBe(200);
    expect(res.json.data.title).toBe('New');
    expect(res.json.data.priority).toBe('low');
    expect(res.json.data.updatedAt > created.json.data.updatedAt).toBe(true);
  });

  it('can clear the due date and category with null', async () => {
    await api.request('POST', '/api/tasks', { title: 'A', dueDate: '2026-01-01' });
    const res = await api.request('PATCH', '/api/tasks/1', { dueDate: null });
    expect(res.json.data.dueDate).toBeNull();
  });

  it('rejects an empty update', async () => {
    await api.request('POST', '/api/tasks', { title: 'A' });
    const res = await api.request('PATCH', '/api/tasks/1', {});
    expect(res.status).toBe(400);
  });

  it('returns 404 when the task does not exist', async () => {
    const res = await api.request('PATCH', '/api/tasks/5', { title: 'New' });
    expect(res.status).toBe(404);
  });
});

describe('complete, reopen and delete', () => {
  it('completes and reopens a task', async () => {
    await api.request('POST', '/api/tasks', { title: 'A' });

    const completed = await api.request('POST', '/api/tasks/1/complete');
    expect(completed.status).toBe(200);
    expect(completed.json.data.status).toBe('completed');

    const reopened = await api.request('POST', '/api/tasks/1/reopen');
    expect(reopened.json.data.status).toBe('pending');
  });

  it('deletes a task', async () => {
    await api.request('POST', '/api/tasks', { title: 'A' });

    const res = await api.request('DELETE', '/api/tasks/1');
    expect(res.status).toBe(204);
    expect(res.json).toBeNull();

    const after = await api.request('GET', '/api/tasks/1');
    expect(after.status).toBe(404);
  });
});

describe('GET /api/tasks (search, filter, sort)', () => {
  beforeEach(async () => {
    const work = await api.request('POST', '/api/categories', { name: 'Work' });
    await api.request('POST', '/api/tasks', { title: 'Pay rent', priority: 'high', dueDate: '2026-10-30' });
    await api.request('POST', '/api/tasks', {
      title: 'Team meeting',
      description: 'Discuss the budget',
      priority: 'low',
      categoryId: work.json.data.id,
      dueDate: '2026-11-01',
    });
    await api.request('POST', '/api/tasks', { title: 'Plan holiday', priority: 'medium', dueDate: '2026-11-20' });
    await api.request('POST', '/api/tasks', { title: 'Read a book', status: 'completed', dueDate: '2026-10-01' });
    await api.request('POST', '/api/tasks', { title: 'Learn Hono', status: 'in_progress' });
  });

  const titles = (res: { json: { data: { title: string }[] } }) => res.json.data.map((t) => t.title);

  it('lists all tasks, newest first by default', async () => {
    const res = await api.request('GET', '/api/tasks');
    expect(res.status).toBe(200);
    expect(titles(res)).toEqual(['Learn Hono', 'Read a book', 'Plan holiday', 'Team meeting', 'Pay rent']);
  });

  it('searches title and description, ignoring letter case', async () => {
    expect(titles(await api.request('GET', '/api/tasks?search=BUDGET'))).toEqual(['Team meeting']);
    expect(titles(await api.request('GET', '/api/tasks?search=pla'))).toEqual(['Plan holiday']);
  });

  it('filters by status, priority and category', async () => {
    expect(titles(await api.request('GET', '/api/tasks?status=in_progress'))).toEqual(['Learn Hono']);
    expect(titles(await api.request('GET', '/api/tasks?priority=high'))).toEqual(['Pay rent']);
    expect(titles(await api.request('GET', '/api/tasks?categoryId=1'))).toEqual(['Team meeting']);
  });

  it('filters by due date relative to the given day', async () => {
    const q = (due: string) => api.request('GET', `/api/tasks?due=${due}&today=2026-11-01`);
    // "Read a book" is in the past but completed, so it is not overdue.
    expect(titles(await q('overdue'))).toEqual(['Pay rent']);
    expect(titles(await q('today'))).toEqual(['Team meeting']);
    expect(titles(await q('upcoming'))).toEqual(['Plan holiday']);
    expect(titles(await q('none'))).toEqual(['Learn Hono']);
  });

  it('sorts by priority', async () => {
    const res = await api.request('GET', '/api/tasks?sort=priority&order=desc&status=pending');
    expect(titles(res)).toEqual(['Pay rent', 'Plan holiday', 'Team meeting']);
  });

  it('sorts by due date with tasks without a date last', async () => {
    const res = await api.request('GET', '/api/tasks?sort=dueDate&order=asc');
    expect(titles(res)).toEqual(['Read a book', 'Pay rent', 'Team meeting', 'Plan holiday', 'Learn Hono']);
  });

  it('sorts by title alphabetically', async () => {
    const res = await api.request('GET', '/api/tasks?sort=title&order=asc');
    expect(titles(res)).toEqual(['Learn Hono', 'Pay rent', 'Plan holiday', 'Read a book', 'Team meeting']);
  });

  it('rejects unknown filter values', async () => {
    const res = await api.request('GET', '/api/tasks?status=finished');
    expect(res.status).toBe(400);
  });
});
