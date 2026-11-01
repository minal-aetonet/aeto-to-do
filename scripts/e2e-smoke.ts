// End-to-end smoke test: pnpm test:e2e
// Starts the real app with a temporary database, opens it in a headless
// browser and clicks through the main features like a real user would.
import { serve } from '@hono/node-server';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { createApp } from '../src/app';
import { closeDatabase, createDatabase, runMigrations } from '../src/db';
import { findBrowser } from './lib/browser';

const tempDir = mkdtempSync(join(tmpdir(), 'hono-todo-e2e-'));
const db = createDatabase(join(tempDir, 'e2e.db'));
runMigrations(db);
const app = createApp({ db, logRequests: false });
const server = serve({ fetch: app.fetch, port: 0 }); // port 0 = any free port
await new Promise((resolve) => server.once('listening', resolve));
const baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

const browser: Browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
const consoleErrors: string[] = [];
let passed = 0;

async function step(name: string, action: () => Promise<void>) {
  await action();
  passed++;
  console.log(`  ✓ ${name}`);
}

/** Today in the browser's time zone, "YYYY-MM-DD" (the test machine = the browser). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const text = (page: Page, selector: string) => page.$eval(selector, (e) => e.textContent?.trim() ?? '');
const titles = (page: Page) => page.$$eval('#task-list .task-title', (els) => els.map((e) => e.textContent));
const waitForTitles = (page: Page, expected: string[]) =>
  page.waitForFunction(
    (exp) => JSON.stringify([...document.querySelectorAll('#task-list .task-title')].map((e) => e.textContent)) === JSON.stringify(exp),
    { timeout: 5000 },
    expected,
  );

/** Opens a page with error listeners: JS errors, console.error() and 404/5xx responses fail the test. */
async function newWatchedPage(context: Browser | Awaited<ReturnType<Browser['createBrowserContext']>>) {
  const page = await context.newPage();
  await page.setViewport({ width: 1280, height: 1000 });
  // "Failed to load resource" messages are network results, checked via "response" instead,
  // because some steps deliberately trigger 400/401 answers.
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('response', (res) => {
    if (res.status() === 404 || res.status() >= 500) consoleErrors.push(`HTTP ${res.status()} for ${res.url()}`);
  });
  return page;
}

async function register(page: Page, name: string, email: string, password: string) {
  await page.goto(baseUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form:not([hidden])');
  await page.click('#show-register');
  await page.type('#register-form input[name="name"]', name);
  await page.type('#register-form input[name="email"]', email);
  await page.type('#register-form input[name="password"]', password);
  await page.click('#register-form button[type="submit"]');
  await page.waitForSelector('#app-screen:not([hidden])');
}

async function goTo(page: Page, view: string) {
  await page.click(`.tab[data-view="${view}"]`);
  await page.waitForSelector(`#view-${view}:not([hidden])`);
}

try {
  const page = await newWatchedPage(browser);
  console.log(`Smoke testing ${baseUrl}`);

  await step('a visitor sees the login screen, not the app', async () => {
    await page.goto(baseUrl, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#auth-screen:not([hidden]) #login-form:not([hidden])');
    if (!(await page.$('#app-screen[hidden]'))) throw new Error('the app should be hidden');
  });

  await step('registration shows server validation errors', async () => {
    await page.click('#show-register');
    await page.type('#register-form input[name="name"]', 'Alice');
    await page.type('#register-form input[name="email"]', 'alice@example.com');
    await page.type('#register-form input[name="password"]', 'short');
    await page.click('#register-form button[type="submit"]');
    await page.waitForSelector('#register-errors:not([hidden])');
    const message = await text(page, '#register-errors');
    if (!message.includes('at least 8 characters')) throw new Error(`unexpected error text: ${message}`);
  });

  await step('registers the first account (admin) and lands on the Dashboard view', async () => {
    await page.$eval('#register-form input[name="password"]', (e) => ((e as HTMLInputElement).value = ''));
    await page.type('#register-form input[name="password"]', 'alice-password-1');
    await page.click('#register-form button[type="submit"]');
    await page.waitForSelector('#app-screen:not([hidden]) #view-dashboard:not([hidden])');
    const chip = await text(page, '#current-user');
    if (!chip.includes('Alice') || !chip.includes('admin')) throw new Error(`unexpected user chip: ${chip}`);
    if (await page.$('#tab-admin[hidden]')) throw new Error('admins should see the Admin tab');
    await page.waitForFunction(() => document.querySelector('[data-stat="total"]')?.textContent === '0');
  });

  await step('the Tasks tab shows the empty state', async () => {
    await goTo(page, 'tasks');
    await page.waitForSelector('#state-empty:not([hidden])');
  });

  await step('creates a category in the category manager', async () => {
    await page.click('#open-categories');
    await page.type('#category-form input[name="name"]', 'Work');
    await page.click('#category-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelectorAll('#category-list .category-item').length === 1);
    await page.click('#category-dialog [data-close]');
  });

  await step('shows validation errors from the server', async () => {
    await page.click('#open-new-task');
    await page.click('#task-submit');
    await page.waitForSelector('#task-form-errors:not([hidden])');
    const message = await text(page, '#task-form-errors');
    if (!message.includes('Title is required')) throw new Error(`unexpected error text: ${message}`);
  });

  await step('creates a task with every field', async () => {
    await page.type('#task-form input[name="title"]', 'Write report');
    await page.type('#task-form textarea[name="description"]', 'Quarterly numbers');
    await page.select('#task-form select[name="priority"]', 'high');
    await page.select('#task-form select[name="categoryId"]', '1');
    await page.$eval('#task-form input[name="dueDate"]', (e) => ((e as HTMLInputElement).value = '2020-01-01'));
    await page.click('#task-submit');
    await waitForTitles(page, ['Write report']);
    const meta = await text(page, '#task-list .task-meta');
    for (const part of ['High priority', 'Work', 'Overdue']) {
      if (!meta.includes(part)) throw new Error(`task meta missing "${part}": ${meta}`);
    }
  });

  await step('shows user text safely (no HTML injection)', async () => {
    await page.click('#open-new-task');
    await page.type('#task-form input[name="title"]', '<img src=x onerror=alert(1)>');
    await page.click('#task-submit');
    await waitForTitles(page, ['<img src=x onerror=alert(1)>', 'Write report']);
    if ((await page.$$('#task-list img')).length !== 0) throw new Error('HTML was injected into the page');
  });

  await step('edits a task', async () => {
    await page.click('#task-list li:nth-child(1) .task-actions button:first-child');
    await page.$eval('#task-form input[name="title"]', (e) => ((e as HTMLInputElement).value = ''));
    await page.type('#task-form input[name="title"]', 'Plan holiday');
    await page.click('#task-submit');
    await waitForTitles(page, ['Plan holiday', 'Write report']);
  });

  await step('adds, ticks and deletes subtasks inside a task', async () => {
    const form = '#task-list li:nth-child(1) .subtask-form';
    await page.type(`${form} input`, 'Book flights');
    await page.click(`${form} button`);
    await page.waitForFunction(() => document.querySelectorAll('#task-list li:nth-child(1) .subtask').length === 1);
    await page.type(`${form} input`, 'Book hotel');
    await page.click(`${form} button`);
    await page.waitForFunction(() => document.querySelectorAll('#task-list li:nth-child(1) .subtask').length === 2);
    await page.click('#task-list li:nth-child(1) .subtask:first-child .checkbox');
    await page.waitForFunction(
      () => document.querySelector('#task-list li:nth-child(1) .subtask-progress')?.textContent === '1/2 subtasks done',
    );
    await page.click('#task-list li:nth-child(1) .subtask:last-child .subtask-delete');
    await page.waitForFunction(() => document.querySelectorAll('#task-list li:nth-child(1) .subtask').length === 1);
  });

  await step('completes and reopens a task', async () => {
    await page.click('#task-list li:nth-child(1) > .checkbox');
    await page.waitForSelector('#task-list li.is-completed');
    await page.click('#task-list li:nth-child(1) > .checkbox');
    await page.waitForFunction(() => !document.querySelector('#task-list li.is-completed'));
  });

  await step('searches and filters', async () => {
    await page.type('#filter-search', 'report');
    await waitForTitles(page, ['Write report']);
    await page.click('#filter-clear');
    await waitForTitles(page, ['Plan holiday', 'Write report']);
    await page.select('#filter-category', '1');
    await waitForTitles(page, ['Write report']);
    await page.select('#filter-due', 'none');
    await page.waitForSelector('#state-empty:not([hidden])');
    if (!(await text(page, '#state-empty-title')).includes('No matching')) throw new Error('wrong empty message');
    await page.click('#filter-clear');
  });

  await step('sorts by title', async () => {
    await page.select('#filter-sort', 'title');
    await page.click('#filter-order'); // switch to ascending
    await waitForTitles(page, ['Plan holiday', 'Write report']);
    await page.click('#filter-clear');
  });

  await step('deletes a task after confirmation', async () => {
    await waitForTitles(page, ['Plan holiday', 'Write report']);
    await page.click('#task-list li:nth-child(1) .task-actions button:last-child');
    await page.waitForSelector('#confirm-dialog[open]');
    await page.click('#confirm-dialog button[value="confirm"]');
    await waitForTitles(page, ['Write report']);
  });

  await step('the Calendar shows a task on its due date and adds one from a day', async () => {
    await goTo(page, 'calendar');
    const day = today();
    await page.waitForSelector(`.calendar-day[data-date="${day}"]`);
    await page.click(`.calendar-day[data-date="${day}"] .calendar-add`);
    await page.waitForSelector('#task-dialog[open]');
    const prefilled = await page.$eval('#task-form input[name="dueDate"]', (e) => (e as HTMLInputElement).value);
    if (prefilled !== day) throw new Error(`due date should be prefilled with ${day}, got ${prefilled}`);
    await page.type('#task-form input[name="title"]', 'Calendar task');
    await page.click('#task-submit');
    await page.waitForFunction(
      (d) => [...document.querySelectorAll(`.calendar-day[data-date="${d}"] .calendar-task`)].some((e) => e.textContent === 'Calendar task'),
      { timeout: 5000 },
      day,
    );
  });

  await step('the Calendar switches between Month, Week, Day and Agenda views', async () => {
    const day = today();
    const hasTask = (selector: string) =>
      page.waitForFunction((s) => document.querySelector(s)?.textContent?.includes('Calendar task'), { timeout: 5000 }, selector);

    await page.click('[data-calendar-mode="week"]');
    await hasTask(`#calendar.mode-week .calendar-day[data-date="${day}"]`);
    if ((await page.$$('#calendar.mode-week .calendar-day')).length !== 7) throw new Error('week view should show 7 days');

    await page.click('[data-calendar-mode="day"]');
    await hasTask(`#calendar.mode-day .calendar-single-day[data-date="${day}"]`);
    const titleToday = await text(page, '#calendar-title');
    await page.click('#cal-next'); // tomorrow: no tasks
    await page.waitForSelector('#calendar.mode-day .calendar-empty');
    if ((await text(page, '#calendar-title')) === titleToday) throw new Error('› should move to the next day');
    await page.click('#cal-prev');
    await hasTask(`#calendar.mode-day .calendar-single-day[data-date="${day}"]`);

    await page.click('[data-calendar-mode="agenda"]');
    await hasTask(`#calendar.mode-agenda .agenda-day[data-date="${day}"]`);

    // The chosen view type is remembered after a reload.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-calendar-mode="agenda"][aria-pressed="true"]');
    await hasTask(`#calendar.mode-agenda .agenda-day[data-date="${day}"]`);

    // Clicking a date opens it in the Day view.
    await page.click(`.agenda-day[data-date="${day}"] .agenda-date`);
    await hasTask(`#calendar.mode-day .calendar-single-day[data-date="${day}"]`);
    await page.click('[data-calendar-mode="month"]');
    await page.waitForSelector('#calendar.mode-month');
  });

  await step('the Dashboard counts tasks and lists what is due', async () => {
    await goTo(page, 'dashboard');
    await page.waitForFunction(() => document.querySelector('[data-stat="total"]')?.textContent === '2');
    await page.waitForFunction(() => document.querySelector('#dash-overdue')?.textContent?.includes('Write report'));
    await page.waitForFunction(() => document.querySelector('#dash-upcoming')?.textContent?.includes('Calendar task'));
  });

  await step('data and login survive a page reload (SQLite + session cookie)', async () => {
    await page.goto(`${baseUrl}/#/tasks`, { waitUntil: 'networkidle0' });
    await waitForTitles(page, ['Calendar task', 'Write report']);
  });

  // A second person, in a separate browser context (like a private window: separate cookies).
  const bobContext = await browser.createBrowserContext();
  const bob = await newWatchedPage(bobContext);

  await step('a second user sees none of the first user’s tasks and no Admin tab', async () => {
    await register(bob, 'Bob', 'bob@example.com', 'bob-password-1');
    if (!(await bob.$('#tab-admin[hidden]'))) throw new Error('normal users must not see the Admin tab');
    await goTo(bob, 'tasks');
    await bob.waitForSelector('#state-empty:not([hidden])');
  });

  await step('the admin assigns a GROUP task to Alice and Bob from the Admin view', async () => {
    await goTo(page, 'admin');
    await page.waitForFunction(() => document.querySelectorAll('#users-list tr').length === 2);
    await page.click('#admin-assign');
    await page.waitForSelector('#task-dialog[open] #assign-fields:not([hidden])');
    await page.type('#task-form input[name="title"]', 'Team retro');
    await page.click('#task-form input[name="kind"][value="group"]');
    for (const box of await page.$$('#assignee-checklist input')) {
      if (!(await box.evaluate((e) => (e as HTMLInputElement).checked))) await box.click();
    }
    await page.click('#task-submit');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#admin-task-list tr')].some(
        (tr) => tr.textContent?.includes('Team retro') && tr.textContent.includes('Group') && tr.textContent.includes('Alice, Bob'),
      ),
    );
  });

  await step('the admin sees who created each task', async () => {
    const row = await page.$$eval('#admin-task-list tr', (trs) => trs.find((tr) => tr.textContent?.includes('Team retro'))?.textContent ?? '');
    if (!row.includes('Alice')) throw new Error(`creator missing in admin table: ${row}`);
    await goTo(page, 'tasks');
    await page.waitForFunction(() => document.querySelector('#task-list .task-creator')?.textContent?.startsWith('Created by'));
  });

  await step('Bob sees the group task, without "Created by" and without Delete', async () => {
    await bob.reload({ waitUntil: 'networkidle0' });
    await waitForTitles(bob, ['Team retro']);
    const meta = await text(bob, '#task-list .task-meta');
    if (!meta.includes('Group: Alice, Bob')) throw new Error(`missing group badge: ${meta}`);
    if (await bob.$('#task-list .task-creator')) throw new Error('normal users must not see who created a task');
    const buttons = await bob.$$eval('#task-list .task-actions button', (els) => els.map((e) => e.textContent));
    if (buttons.includes('Delete')) throw new Error('Bob did not create the task, so no Delete button');
  });

  await step('Bob ticks a shared subtask and Alice sees it', async () => {
    await bob.type('#task-list li:nth-child(1) .subtask-form input', 'Collect feedback');
    await bob.click('#task-list li:nth-child(1) .subtask-form button');
    await bob.waitForSelector('#task-list li:nth-child(1) .subtask');
    await bob.click('#task-list li:nth-child(1) .subtask .checkbox');
    await bob.waitForSelector('#task-list li:nth-child(1) .subtask.is-done');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#task-list .task')].some(
        (li) => li.textContent?.includes('Team retro') && li.querySelector('.subtask.is-done'),
      ),
    );
    await bobContext.close();
  });

  await step('logs out and is back on the login screen', async () => {
    await page.click('#logout');
    await page.waitForSelector('#auth-screen:not([hidden]) #login-form:not([hidden])');
  });

  await step('a wrong password is refused', async () => {
    await page.type('#login-form input[name="email"]', 'alice@example.com');
    await page.type('#login-form input[name="password"]', 'wrong-password');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#login-errors:not([hidden])');
    if (!(await text(page, '#login-errors')).includes('Incorrect email or password')) throw new Error('missing error');
  });

  await step('logs back in and finds the same tasks', async () => {
    await page.$eval('#login-form input[name="password"]', (e) => ((e as HTMLInputElement).value = ''));
    await page.type('#login-form input[name="password"]', 'alice-password-1');
    await page.click('#login-form button[type="submit"]');
    await page.waitForSelector('#app-screen:not([hidden])');
    await goTo(page, 'tasks');
    await waitForTitles(page, ['Team retro', 'Calendar task', 'Write report']);
    if ((await titles(page)).length !== 3) throw new Error('unexpected task count');
  });

  if (consoleErrors.length > 0) {
    throw new Error(`Browser console errors:\n${consoleErrors.join('\n')}`);
  }
  console.log(`\nAll ${passed} smoke-test steps passed with no browser console errors.`);
} catch (error) {
  console.error(`\nSmoke test FAILED after ${passed} passing step(s):`, error);
  const pages = await browser.pages();
  const page = pages.at(-1);
  if (page) {
    console.error('Visible task titles:', await titles(page).catch(() => []));
  }
  if (consoleErrors.length > 0) console.error('Browser console errors:', consoleErrors);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  closeDatabase(db);
  rmSync(tempDir, { recursive: true, force: true });
}
