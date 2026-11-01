import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { subtasks } from '../src/db/schema';
import { createTestApp } from './helpers';

let api: Awaited<ReturnType<typeof createTestApp>>;

beforeEach(async () => {
  api = await createTestApp();
});

async function newTask(title = 'Plan trip') {
  return (await api.request('POST', '/api/tasks', { title })).json.data;
}

describe('subtasks (tasks inside a task)', () => {
  it('adds subtasks and returns them with the task', async () => {
    const task = await newTask();
    const first = await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: '  Book flights ' });
    expect(first.status).toBe(201);
    expect(first.json.data).toMatchObject({ title: 'Book flights', done: false });
    await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Book hotel' });

    const loaded = (await api.request('GET', `/api/tasks/${task.id}`)).json.data;
    expect(loaded.subtasks.map((s: { title: string }) => s.title)).toEqual(['Book flights', 'Book hotel']);

    // Subtasks are included in lists too.
    const list = (await api.request('GET', '/api/tasks')).json.data;
    expect(list[0].subtasks).toHaveLength(2);
  });

  it('ticks, renames and deletes a subtask', async () => {
    const task = await newTask();
    const sub = (await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Step' })).json.data;

    const ticked = await api.request('PATCH', `/api/subtasks/${sub.id}`, { done: true });
    expect(ticked.status).toBe(200);
    expect(ticked.json.data.done).toBe(true);

    const renamed = await api.request('PATCH', `/api/subtasks/${sub.id}`, { title: 'Step 1' });
    expect(renamed.json.data).toMatchObject({ title: 'Step 1', done: true });

    expect((await api.request('DELETE', `/api/subtasks/${sub.id}`)).status).toBe(204);
    expect((await api.request('GET', `/api/tasks/${task.id}`)).json.data.subtasks).toEqual([]);
  });

  it('changing a subtask moves the task’s "updated" time forward', async () => {
    const task = await newTask();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Step' });
    const after = (await api.request('GET', `/api/tasks/${task.id}`)).json.data;
    expect(after.updatedAt > task.updatedAt).toBe(true);
  });

  it('validates the title and the update body', async () => {
    const task = await newTask();
    expect((await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: '  ' })).status).toBe(400);
    const sub = (await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Step' })).json.data;
    expect((await api.request('PATCH', `/api/subtasks/${sub.id}`, {})).status).toBe(400);
    expect((await api.request('PATCH', `/api/subtasks/${sub.id}`, { done: 'yes' })).status).toBe(400);
  });

  it('other users cannot see or change subtasks of tasks they cannot see', async () => {
    const alice = await api.registerClient();
    const task = (await alice.request('POST', '/api/tasks', { title: 'Alice task' })).json.data;
    const sub = (await alice.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Secret' })).json.data;

    const bob = await api.registerClient();
    expect((await bob.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'X' })).status).toBe(404);
    expect((await bob.request('PATCH', `/api/subtasks/${sub.id}`, { done: true })).status).toBe(404);
    expect((await bob.request('DELETE', `/api/subtasks/${sub.id}`)).status).toBe(404);
  });

  it('group members share the subtask checklist', async () => {
    const alice = await api.registerClient({ name: 'Alice' });
    const bob = await api.registerClient({ name: 'Bob' });
    const task = (
      await api.request('POST', '/api/tasks', { title: 'G', assigneeIds: [alice.user.id, bob.user.id] })
    ).json.data;
    const sub = (await alice.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Shared step' })).json.data;
    expect((await bob.request('PATCH', `/api/subtasks/${sub.id}`, { done: true })).status).toBe(200);
    expect((await alice.request('GET', `/api/tasks/${task.id}`)).json.data.subtasks[0].done).toBe(true);
  });

  it('deleting a task deletes its subtasks', async () => {
    const task = await newTask();
    await api.request('POST', `/api/tasks/${task.id}/subtasks`, { title: 'Step' });
    await api.request('DELETE', `/api/tasks/${task.id}`);
    expect(api.db.select().from(subtasks).where(eq(subtasks.taskId, task.id)).all()).toEqual([]);
  });

  it('returns 404 for a subtask that does not exist', async () => {
    expect((await api.request('PATCH', '/api/subtasks/999', { done: true })).status).toBe(404);
  });
});
