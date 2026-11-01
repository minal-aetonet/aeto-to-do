// ui.js — functions that turn data into things on the screen.
// SECURITY: we always put user text into the page with textContent, never
// innerHTML, so a task titled "<script>..." is shown as text and never runs.

import { addDays, localToday, toDateString } from './api.js';

const STATUS_LABELS = { pending: 'Pending', in_progress: 'In progress', completed: 'Completed' };
const PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

/** Small helper: create an element with a class and optional text. */
export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Small helper: a <button type="button"> with a class, text and click handler. */
function button(className, text, onClick) {
  const element = el('button', className, text);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

/** Shows a notification in the bottom-right corner for a few seconds. */
export function showToast(message, type = 'info') {
  const toast = el('div', `toast toast-${type}`, message);
  document.getElementById('toasts').append(toast);
  setTimeout(() => toast.remove(), 3500);
}

/** "2026-11-01" -> "1 Nov 2026" (in the user's language). */
function formatDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO timestamp -> short local date and time. */
function formatTimestamp(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// ===================== Top bar and dashboard =====================

/** Fills the dashboard cards and progress bar with numbers from the API. */
export function renderDashboard(stats) {
  for (const element of document.querySelectorAll('[data-stat]')) {
    const key = element.dataset.stat;
    element.textContent = key === 'completionPercentage' ? `${stats[key]}%` : String(stats[key]);
  }
  document.getElementById('progress-bar').style.width = `${stats.completionPercentage}%`;
  document.getElementById('progress').setAttribute('aria-valuenow', String(stats.completionPercentage));
}

/** Puts "–" back in every dashboard card (used when a different user logs in). */
export function resetDashboard() {
  for (const element of document.querySelectorAll('[data-stat]')) element.textContent = '–';
  document.getElementById('progress-bar').style.width = '0%';
}

/** Shows the logged-in user's name (and an "admin" badge) and the Admin tab for admins. */
export function renderCurrentUser(user) {
  const chip = document.getElementById('current-user');
  const name = el('strong', '', user.name);
  chip.replaceChildren(document.createTextNode('Signed in as '), name);
  if (user.role === 'admin') chip.append(el('span', 'role-badge', 'admin'));
  document.getElementById('tab-admin').hidden = user.role !== 'admin';
}

/** Highlights the tab of the current view. */
export function renderActiveTab(view) {
  for (const tab of document.querySelectorAll('.tab')) {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
}

/** A short clickable list of tasks (used on the dashboard). */
export function renderCompactList(listId, tasks, onClick, emptyText) {
  const list = document.getElementById(listId);
  if (tasks.length === 0) {
    list.replaceChildren(el('li', 'compact-empty', emptyText));
    return;
  }
  list.replaceChildren(
    ...tasks.map((task) => {
      const item = el('li');
      const row = button('compact-item', '', () => onClick(task));
      row.append(el('span', '', task.title), el('span', 'compact-date', task.dueDate ? formatDate(task.dueDate) : ''));
      item.append(row);
      return item;
    }),
  );
}

// ===================== Task list =====================

/** Shows exactly one of: loading, error, empty, or the list. */
export function showListState(state, message) {
  document.getElementById('state-loading').hidden = state !== 'loading';
  document.getElementById('state-error').hidden = state !== 'error';
  document.getElementById('state-empty').hidden = state !== 'empty';
  document.getElementById('task-list').hidden = state !== 'list';
  if (state === 'error' && message) {
    document.getElementById('state-error-message').textContent = message;
  }
}

/** "Group: Alice, Bob" or "Assigned to Bob" badge. Nothing for your own individual task. */
function assigneeBadge(task, currentUserId) {
  const names = task.assignees.map((a) => a.name).join(', ');
  if (task.isGroup) return el('span', 'badge badge-group', `Group: ${names}`);
  const onlyMe = task.assignees.length === 1 && task.assignees[0].id === currentUserId;
  if (onlyMe) return null;
  return el('span', 'badge badge-person', task.assignees.length ? `Assigned to ${names}` : 'Unassigned');
}

/** The checklist of subtasks inside a task card. */
function createSubtaskSection(task, handlers) {
  const section = el('div', 'subtasks');
  const done = task.subtasks.filter((s) => s.done).length;
  if (task.subtasks.length > 0) {
    section.append(el('p', 'subtask-progress', `${done}/${task.subtasks.length} subtasks done`));
  }

  const list = el('ul', 'subtask-list');
  for (const subtask of task.subtasks) {
    const item = el('li', `subtask${subtask.done ? ' is-done' : ''}`);
    const box = el('input', 'checkbox');
    box.type = 'checkbox';
    box.checked = subtask.done;
    box.setAttribute('aria-label', `Subtask "${subtask.title}" done`);
    box.addEventListener('change', () => handlers.onSubtaskToggle(subtask));
    const remove = button('subtask-delete', '×', () => handlers.onSubtaskDelete(subtask));
    remove.setAttribute('aria-label', `Delete subtask "${subtask.title}"`);
    item.append(box, el('span', 'subtask-title', subtask.title), remove);
    list.append(item);
  }
  section.append(list);

  // A small form to add a new subtask (press Enter or click Add).
  const form = el('form', 'subtask-form');
  const input = el('input', 'input');
  input.placeholder = 'Add a subtask…';
  input.maxLength = 200;
  input.setAttribute('aria-label', `Add a subtask to "${task.title}"`);
  const add = el('button', 'btn btn-secondary btn-small', 'Add');
  add.type = 'submit';
  form.append(input, add);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim()) handlers.onSubtaskAdd(task, input.value);
  });
  section.append(form);
  return section;
}

/** Builds the <li> for one task. "handlers" are the functions for its buttons. */
function createTaskItem(task, handlers, currentUserId) {
  const today = localToday();
  const isCompleted = task.status === 'completed';
  const item = el('li', `task priority-${task.priority}${isCompleted ? ' is-completed' : ''}`);
  item.dataset.id = String(task.id);

  // Checkbox: ticking it completes the task, unticking reopens it.
  const checkbox = el('input', 'checkbox');
  checkbox.type = 'checkbox';
  checkbox.checked = isCompleted;
  checkbox.setAttribute('aria-label', isCompleted ? `Reopen "${task.title}"` : `Complete "${task.title}"`);
  checkbox.addEventListener('change', () => handlers.onToggle(task));

  const body = el('div', 'task-body');
  body.append(el('p', 'task-title', task.title));
  if (task.description) body.append(el('p', 'task-description', task.description));

  const meta = el('div', 'task-meta');
  meta.append(el('span', `badge badge-status-${task.status}`, STATUS_LABELS[task.status]));
  meta.append(el('span', `badge badge-priority-${task.priority}`, `${PRIORITY_LABELS[task.priority]} priority`));
  const people = assigneeBadge(task, currentUserId);
  if (people) meta.append(people);
  if (task.category) {
    const chip = el('span', 'badge');
    const dot = el('span', 'dot');
    dot.style.backgroundColor = task.category.color;
    chip.append(dot, document.createTextNode(task.category.name));
    meta.append(chip);
  }
  if (task.dueDate) {
    meta.append(el('span', 'badge', `Due ${formatDate(task.dueDate)}`));
    if (!isCompleted && task.dueDate < today) meta.append(el('span', 'badge badge-overdue', 'Overdue'));
    if (!isCompleted && task.dueDate === today) meta.append(el('span', 'badge badge-today', 'Due today'));
  }
  body.append(meta);
  // Only administrators receive "createdBy" from the server.
  if (task.createdBy) body.append(el('p', 'task-creator', `Created by ${task.createdBy.name}`));
  body.append(el('p', 'task-dates', `Created ${formatTimestamp(task.createdAt)} · Updated ${formatTimestamp(task.updatedAt)}`));
  body.append(createSubtaskSection(task, handlers));

  const actions = el('div', 'task-actions');
  actions.append(button('btn btn-ghost btn-small', 'Edit', () => handlers.onEdit(task)));
  if (task.canDelete) actions.append(button('btn btn-ghost btn-small', 'Delete', () => handlers.onDelete(task)));

  item.append(checkbox, body, actions);
  return item;
}

/** Replaces the whole task list with the given tasks. */
export function renderTaskList(tasks, handlers, currentUserId) {
  const list = document.getElementById('task-list');
  list.replaceChildren(...tasks.map((task) => createTaskItem(task, handlers, currentUserId)));
  document.getElementById('task-count').textContent = `(${tasks.length})`;
}

// ===================== Calendar =====================

// The calendar has four view types ("modes"). Every mode is described by an
// "anchor" date ("YYYY-MM-DD"): the day the view is built around.
//   month  — 6 weeks (42 days) around the anchor's month
//   week   — the Monday-to-Sunday week that contains the anchor
//   day    — only the anchor day, as a detailed list
//   agenda — a list of the AGENDA_DAYS days starting at the anchor
export const CALENDAR_MODES = ['month', 'week', 'day', 'agenda'];
export const AGENDA_DAYS = 30;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "2026-11-01" -> a JavaScript Date at local midnight. */
function parseDate(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** The Monday on or before a date ("YYYY-MM-DD"). */
function mondayOf(dateString) {
  const mondayOffset = (parseDate(dateString).getDay() + 6) % 7; // Monday=0 … Sunday=6
  return addDays(dateString, -mondayOffset);
}

/** The first and last date a calendar mode shows. */
export function calendarRange(mode, anchor) {
  if (mode === 'day') return { start: anchor, end: anchor };
  if (mode === 'week') {
    const start = mondayOf(anchor);
    return { start, end: addDays(start, 6) };
  }
  if (mode === 'agenda') return { start: anchor, end: addDays(anchor, AGENDA_DAYS - 1) };
  // month: whole weeks around the month — 6 weeks × 7 days = 42 cells
  const date = parseDate(anchor);
  const start = mondayOf(toDateString(new Date(date.getFullYear(), date.getMonth(), 1)));
  return { start, end: addDays(start, 41) };
}

/** The anchor after pressing ‹ (direction -1) or › (direction +1). */
export function shiftCalendar(mode, anchor, direction) {
  if (mode === 'month') {
    const date = parseDate(anchor);
    return toDateString(new Date(date.getFullYear(), date.getMonth() + direction, 1));
  }
  if (mode === 'week') return addDays(anchor, 7 * direction);
  if (mode === 'day') return addDays(anchor, direction);
  return addDays(anchor, AGENDA_DAYS * direction); // agenda
}

/** The heading above the calendar, e.g. "November 2026" or "26 Oct – 1 Nov 2026". */
function calendarTitle(mode, anchor) {
  const { start, end } = calendarRange(mode, anchor);
  const short = (d) => parseDate(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const year = parseDate(end).getFullYear();
  if (mode === 'month') return parseDate(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (mode === 'day') {
    return parseDate(anchor).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return `${short(start)} – ${short(end)} ${year}`; // week and agenda
}

/** A small clickable task label for the month and week grids. */
function calendarChip(task, today, detailed) {
  const isCompleted = task.status === 'completed';
  let className = `calendar-task priority-${task.priority}`;
  if (isCompleted) className += ' is-completed';
  if (!isCompleted && task.dueDate < today) className += ' is-overdue';
  if (detailed) className += ' is-detailed';
  const chip = el('button', className);
  chip.type = 'button';
  chip.title = task.title;
  chip.append(el('span', 'calendar-task-title', task.isGroup ? `👥 ${task.title}` : task.title));
  if (detailed) {
    // Week view has room for a second line: status and subtask progress.
    let info = STATUS_LABELS[task.status];
    if (task.subtasks.length) info += ` · ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}`;
    chip.append(el('span', 'calendar-task-info', info));
  }
  return chip;
}

/** One day cell of the month or week grid. */
function calendarCell(date, tasks, handlers, { today, outside, detailed, label }) {
  const cell = el('div', 'calendar-day');
  cell.dataset.date = date;
  if (outside) cell.classList.add('other-month');
  if (date === today) cell.classList.add('is-today');

  const head = el('div', 'calendar-day-head');
  // Clicking the date number opens that day in the Day view.
  const dateButton = button('calendar-date', label, () => handlers.onDayClick(date));
  dateButton.setAttribute('aria-label', `Show ${formatDate(date)} in day view`);
  const add = button('calendar-add', '+', () => handlers.onAddForDate(date));
  add.setAttribute('aria-label', `Add a task on ${formatDate(date)}`);
  head.append(dateButton, add);
  cell.append(head);

  for (const task of tasks.filter((t) => t.dueDate === date)) {
    const chip = calendarChip(task, today, detailed);
    chip.addEventListener('click', () => handlers.onTaskClick(task));
    cell.append(chip);
  }
  return cell;
}

/** A full-width row describing one task (Day and Agenda views). */
function calendarRow(task, today, handlers) {
  const isCompleted = task.status === 'completed';
  const row = button(`calendar-row priority-${task.priority}${isCompleted ? ' is-completed' : ''}`, '', () =>
    handlers.onTaskClick(task),
  );
  row.append(el('span', 'calendar-row-title', task.title));
  const meta = el('span', 'calendar-row-meta');
  meta.append(el('span', `badge badge-status-${task.status}`, STATUS_LABELS[task.status]));
  meta.append(el('span', `badge badge-priority-${task.priority}`, PRIORITY_LABELS[task.priority]));
  if (task.isGroup) meta.append(el('span', 'badge badge-group', `Group: ${task.assignees.map((a) => a.name).join(', ')}`));
  if (task.subtasks.length) {
    meta.append(el('span', 'badge', `${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length} subtasks`));
  }
  if (!isCompleted && task.dueDate < today) meta.append(el('span', 'badge badge-overdue', 'Overdue'));
  row.append(meta);
  return row;
}

/** Draws the calendar in the chosen mode, with each task on its due date. */
export function renderCalendar(mode, anchor, tasks, handlers) {
  const container = document.getElementById('calendar');
  const today = localToday();
  container.className = `calendar mode-${mode}`;
  document.getElementById('calendar-title').textContent = calendarTitle(mode, anchor);
  for (const modeButton of document.querySelectorAll('[data-calendar-mode]')) {
    modeButton.setAttribute('aria-pressed', String(modeButton.dataset.calendarMode === mode));
  }
  const { start, end } = calendarRange(mode, anchor);

  if (mode === 'month') {
    const month = parseDate(anchor).getMonth();
    const cells = WEEKDAYS.map((name) => el('div', 'calendar-weekday', name));
    for (let i = 0; i < 42; i++) {
      const date = addDays(start, i);
      const outside = parseDate(date).getMonth() !== month;
      cells.push(calendarCell(date, tasks, handlers, { today, outside, detailed: false, label: String(parseDate(date).getDate()) }));
    }
    container.replaceChildren(...cells);
    return;
  }

  if (mode === 'week') {
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      cells.push(calendarCell(date, tasks, handlers, { today, outside: false, detailed: true, label: `${WEEKDAYS[i]} ${parseDate(date).getDate()}` }));
    }
    container.replaceChildren(...cells);
    return;
  }

  if (mode === 'day') {
    const dayTasks = tasks.filter((t) => t.dueDate === anchor);
    const panel = el('div', 'calendar-single-day');
    panel.dataset.date = anchor;
    const head = el('div', 'calendar-single-head');
    head.append(
      el('span', 'muted', `${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'} due`),
      button('btn btn-secondary btn-small', '+ Add task on this day', () => handlers.onAddForDate(anchor)),
    );
    panel.append(head);
    if (dayTasks.length === 0) panel.append(el('p', 'calendar-empty', 'No tasks due on this day.'));
    for (const task of dayTasks) panel.append(calendarRow(task, today, handlers));
    container.replaceChildren(panel);
    return;
  }

  // agenda: only the days in the range that have tasks, grouped by date
  const groups = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const dayTasks = tasks.filter((t) => t.dueDate === date);
    if (dayTasks.length === 0) continue;
    const group = el('section', 'agenda-day');
    group.dataset.date = date;
    const heading = button('agenda-date', '', () => handlers.onDayClick(date));
    heading.append(document.createTextNode(parseDate(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })));
    if (date === today) heading.append(el('span', 'badge badge-today', 'Today'));
    group.append(heading);
    for (const task of dayTasks) group.append(calendarRow(task, today, handlers));
    groups.push(group);
  }
  if (groups.length === 0) groups.push(el('p', 'calendar-empty', `Nothing due in these ${AGENDA_DAYS} days.`));
  container.replaceChildren(...groups);
}

// ===================== Admin view =====================

/** Fills the admin "Users" table. */
export function renderAdminUsers(users) {
  const rows = users.map((user) => {
    const row = el('tr');
    const joined = new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
    for (const value of [user.name, user.email, user.role, String(user.taskCount), joined]) {
      row.append(el('td', '', value));
    }
    return row;
  });
  document.getElementById('users-list').replaceChildren(...rows);
}

/** Fills the admin "All tasks" table, including who created each task. */
export function renderAdminTasks(tasks, handlers) {
  const rows = tasks.map((task) => {
    const row = el('tr');
    const cells = [
      task.title,
      task.isGroup ? 'Group' : 'Individual',
      task.assignees.map((a) => a.name).join(', ') || '—',
      task.createdBy ? task.createdBy.name : '—',
      STATUS_LABELS[task.status],
      task.dueDate ? formatDate(task.dueDate) : '—',
    ];
    for (const value of cells) row.append(el('td', '', value));
    const actions = el('td', 'actions');
    actions.append(
      button('btn btn-ghost btn-small', 'Edit', () => handlers.onEdit(task)),
      button('btn btn-ghost btn-small', 'Delete', () => handlers.onDelete(task)),
    );
    row.append(actions);
    return row;
  });
  if (rows.length === 0) {
    const empty = el('tr');
    const cell = el('td', 'muted', 'No tasks.');
    cell.colSpan = 7;
    empty.append(cell);
    rows.push(empty);
  }
  document.getElementById('admin-task-list').replaceChildren(...rows);
  document.getElementById('admin-task-count').textContent = `(${tasks.length})`;
}

/** Fills the "Assign to" controls of the task form with every user. */
export function renderAssigneeOptions(users) {
  const select = document.getElementById('assignee-select');
  select.replaceChildren(
    ...users.map((user) => {
      const option = el('option', '', `${user.name} (${user.email})`);
      option.value = String(user.id);
      return option;
    }),
  );
  const checklist = document.getElementById('assignee-checklist');
  checklist.replaceChildren(
    ...users.map((user) => {
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.name = 'assignees';
      box.value = String(user.id);
      label.append(box, document.createTextNode(user.name));
      return label;
    }),
  );
}

// ===================== Categories, forms, dialogs =====================

/** Fills a <select> with category options, keeping its first "All / None" option. */
export function renderCategoryOptions(select, categories) {
  const keep = select.options[0];
  const previous = select.value;
  const options = categories.map((category) => {
    const option = el('option', '', category.name);
    option.value = String(category.id);
    return option;
  });
  select.replaceChildren(keep, ...options);
  // Keep the previous choice if that category still exists.
  select.value = categories.some((c) => String(c.id) === previous) ? previous : '';
}

/** Builds the editable rows in the category manager dialog. */
export function renderCategoryManager(categories, handlers) {
  const list = document.getElementById('category-list');
  document.getElementById('category-empty').hidden = categories.length > 0;

  list.replaceChildren(
    ...categories.map((category) => {
      const item = el('li', 'category-item');

      const color = el('input', 'color-input');
      color.type = 'color';
      color.value = category.color;
      color.setAttribute('aria-label', `Color of ${category.name}`);

      const name = el('input', 'input');
      name.value = category.name;
      name.maxLength = 50;
      name.setAttribute('aria-label', 'Category name');

      const count = el('span', 'category-count', `${category.taskCount} task${category.taskCount === 1 ? '' : 's'}`);
      const save = button('btn btn-secondary btn-small', 'Save', () =>
        handlers.onSave(category, { name: name.value, color: color.value }),
      );
      const remove = button('btn btn-ghost btn-small', 'Delete', () => handlers.onDelete(category));

      item.append(color, name, count, save, remove);
      return item;
    }),
  );
}

/** Shows validation messages from the API inside a form. */
export function showFormErrors(listElement, error) {
  const messages = error.details?.length ? error.details.map((d) => d.message) : [error.message];
  listElement.replaceChildren(...messages.map((message) => el('li', '', message)));
  listElement.hidden = false;
}

/**
 * Opens the confirmation dialog and resolves to true if the user clicked
 * "Delete", or false for "Cancel" / Escape.
 */
export function confirmAction(message) {
  const dialog = document.getElementById('confirm-dialog');
  document.getElementById('confirm-message').textContent = message;
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
  });
}
