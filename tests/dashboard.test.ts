import { describe, expect, it } from 'vitest';
import { getDashboardStats } from '../src/services/dashboard.service';
import { createTestApp } from './helpers';

describe('dashboard', () => {
  it('returns zeros for an empty database', async () => {
    const api = await createTestApp();
    const res = await api.request('GET', '/api/dashboard?today=2026-11-01');
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual({
      total: 0,
      completed: 0,
      pending: 0,
      inProgress: 0,
      overdue: 0,
      dueToday: 0,
      groupTasks: 0,
      completionPercentage: 0,
      today: '2026-11-01',
    });
  });

  it('counts every statistic correctly', async () => {
    const api = await createTestApp();
    const create = (body: object) => api.request('POST', '/api/tasks', { title: 'T', ...body });
    await create({ dueDate: '2026-10-01' }); // pending, overdue
    await create({ status: 'in_progress', dueDate: '2026-11-01' }); // in progress, due today
    await create({ dueDate: '2026-11-01' }); // pending, due today
    await create({ status: 'completed', dueDate: '2026-10-01' }); // completed (not overdue)
    await create({ status: 'completed', dueDate: '2026-11-01' }); // completed (not "due today")
    await create({}); // pending, no due date

    // Calling the service directly is a unit test; the route test above is an integration test.
    const stats = getDashboardStats(api.db, api.user.id, '2026-11-01');
    expect(stats).toEqual({
      total: 6,
      completed: 2,
      pending: 3,
      inProgress: 1,
      overdue: 1,
      dueToday: 2,
      groupTasks: 0,
      completionPercentage: 33,
      today: '2026-11-01',
    });
  });

  it('rejects an invalid date', async () => {
    const api = await createTestApp();
    const res = await api.request('GET', '/api/dashboard?today=yesterday');
    expect(res.status).toBe(400);
  });
});
