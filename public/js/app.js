// app.js — the starting point of the frontend.
// It keeps the current state (user, view, filters, categories, …), listens
// for user actions, calls the API and asks ui.js to redraw the screen.

import * as api from './api.js';
import {
  CALENDAR_MODES,
  calendarRange,
  confirmAction,
  el,
  renderActiveTab,
  renderAdminTasks,
  renderAdminUsers,
  renderAssigneeOptions,
  renderCalendar,
  renderCategoryManager,
  renderCategoryOptions,
  renderCompactList,
  renderCurrentUser,
  renderDashboard,
  renderTaskList,
  resetDashboard,
  shiftCalendar,
  showFormErrors,
  showListState,
  showToast,
} from './ui.js';

// ----- State: the information the page remembers while it is open -----
const VIEWS = ['dashboard', 'tasks', 'calendar', 'admin'];
const DEFAULT_FILTERS = {
  search: '',
  status: '',
  priority: '',
  kind: '',
  categoryId: '',
  due: '',
  sort: 'createdAt',
  order: 'desc',
};
const state = {
  user: null, // the logged-in user, or null when logged out
  view: 'dashboard', // which tab is showing
  filters: { ...DEFAULT_FILTERS },
  categories: [],
  users: [], // all users (admins only, for assigning tasks)
  editingTask: null, // null = creating a new task, otherwise the task being edited
  // Calendar: which view type, and the date it is built around ("YYYY-MM-DD").
  // The view type is remembered in the browser (localStorage) between visits.
  calendarMode: CALENDAR_MODES.includes(localStorage.getItem('calendarMode')) ? localStorage.getItem('calendarMode') : 'month',
  calendarAnchor: api.localToday(),
  adminAssigneeFilter: '',
};

// ----- Shortcuts to elements we use often -----
const $ = (id) => document.getElementById(id);
const taskDialog = $('task-dialog');
const taskForm = $('task-form');
const taskFormErrors = $('task-form-errors');
const categoryDialog = $('category-dialog');
const categoryForm = $('category-form');

const isAdmin = () => state.user?.role === 'admin';

// ===================== Views (tabs) =====================
// The address bar holds the current view: #/dashboard, #/tasks, #/calendar, #/admin.
// Changing it (by clicking a tab link) fires "hashchange", and we show that view.

function viewFromHash() {
  const name = location.hash.replace(/^#\/?/, '');
  if (!VIEWS.includes(name)) return 'dashboard';
  if (name === 'admin' && !isAdmin()) return 'dashboard'; // only admins may open it
  return name;
}

function showView(name) {
  state.view = name;
  for (const view of VIEWS) $(`view-${view}`).hidden = view !== name;
  renderActiveTab(name);
  loadCurrentView();
}

/** Loads the data the current view needs. Called after every change, too. */
function loadCurrentView() {
  if (state.view === 'dashboard') return loadDashboard();
  if (state.view === 'tasks') return loadTasks();
  if (state.view === 'calendar') return loadCalendar();
  if (state.view === 'admin') return loadAdmin();
}

// ===================== Loading data =====================

/** The functions a task card needs for its buttons and subtasks. */
const taskHandlers = {
  onToggle: toggleTask,
  onEdit: (task) => openTaskForm({ task }),
  onDelete: removeTask,
  onSubtaskAdd: addSubtask,
  onSubtaskToggle: toggleSubtask,
  onSubtaskDelete: removeSubtask,
};

/** Loads the tasks that match the current filters and shows them. */
async function loadTasks() {
  showListState('loading');
  try {
    const tasks = await api.getTasks(state.filters);
    if (tasks.length === 0) {
      const filtering = JSON.stringify(state.filters) !== JSON.stringify(DEFAULT_FILTERS);
      $('state-empty-title').textContent = filtering ? 'No matching tasks' : 'No tasks yet';
      $('state-empty-text').textContent = filtering
        ? 'Try a different search or clear the filters.'
        : 'Create your first task with the "+ New task" button.';
      $('task-count').textContent = '(0)';
      showListState('empty');
    } else {
      renderTaskList(tasks, taskHandlers, state.user.id);
      showListState('list');
    }
  } catch (error) {
    showListState('error', error.message);
  }
}

/** Loads the dashboard numbers and the two short lists. */
async function loadDashboard() {
  const today = api.localToday();
  try {
    const [stats, overdue, upcoming] = await Promise.all([
      api.getDashboard(),
      api.getTasks({ due: 'overdue', sort: 'dueDate', order: 'asc' }),
      api.getTasks({ dueFrom: today, dueTo: api.addDays(today, 6), sort: 'dueDate', order: 'asc' }),
    ]);
    renderDashboard(stats);
    const openTask = (task) => openTaskForm({ task });
    renderCompactList('dash-overdue', overdue.slice(0, 8), openTask, 'Nothing overdue. 🎉');
    renderCompactList(
      'dash-upcoming',
      upcoming.filter((t) => t.status !== 'completed').slice(0, 8),
      openTask,
      'Nothing due in the next 7 days.',
    );
  } catch (error) {
    showToast(`Could not load dashboard: ${error.message}`, 'error');
  }
}

/** Loads the tasks due in the dates the current calendar mode shows, and draws them. */
async function loadCalendar() {
  const { start, end } = calendarRange(state.calendarMode, state.calendarAnchor);
  try {
    const tasks = await api.getTasks({ dueFrom: start, dueTo: end, sort: 'dueDate', order: 'asc' });
    renderCalendar(state.calendarMode, state.calendarAnchor, tasks, {
      onTaskClick: (task) => openTaskForm({ task }),
      onAddForDate: (date) => openTaskForm({ dueDate: date }),
      onDayClick: (date) => setCalendarMode('day', date),
    });
  } catch (error) {
    showToast(`Could not load calendar: ${error.message}`, 'error');
  }
}

/** Switches the calendar view type (month, week, day, agenda), optionally to a new date. */
function setCalendarMode(mode, anchor = state.calendarAnchor) {
  state.calendarMode = mode;
  state.calendarAnchor = anchor;
  localStorage.setItem('calendarMode', mode);
  loadCalendar();
}

/** ‹ and › — one month, week, day or agenda page back or forward. */
function moveCalendar(direction) {
  state.calendarAnchor = shiftCalendar(state.calendarMode, state.calendarAnchor, direction);
  loadCalendar();
}

/** Admin view: every user, and every task with its creator and assignees. */
async function loadAdmin() {
  try {
    const [users, tasks] = await Promise.all([
      loadUsers(),
      api.getAdminTasks({ assigneeId: state.adminAssigneeFilter, sort: 'createdAt', order: 'desc' }),
    ]);
    renderAdminUsers(users);
    renderAdminTasks(tasks, { onEdit: (task) => openTaskForm({ task }), onDelete: removeTask });
  } catch (error) {
    showToast(`Could not load admin data: ${error.message}`, 'error');
  }
}

/** Loads all users (admins only) for the Admin view and the assignee picker. */
async function loadUsers() {
  state.users = await api.getUsers();
  renderAssigneeOptions(state.users);
  const filter = $('admin-filter-user');
  const keep = filter.options[0];
  filter.replaceChildren(
    keep,
    ...state.users.map((user) => {
      const option = el('option', '', user.name);
      option.value = String(user.id);
      return option;
    }),
  );
  filter.value = state.adminAssigneeFilter;
  return state.users;
}

/** Loads categories and refreshes every place that shows them. */
async function loadCategories() {
  try {
    state.categories = await api.getCategories();
    renderCategoryOptions($('filter-category'), state.categories);
    renderCategoryOptions($('task-category-select'), state.categories);
    renderCategoryManager(state.categories, { onSave: saveCategory, onDelete: removeCategory });
  } catch (error) {
    showToast(`Could not load categories: ${error.message}`, 'error');
  }
}

// ===================== The task form (create and edit) =====================

/** Shows "one person" or "several people" controls depending on the chosen kind. */
function updateAssignControls() {
  const group = taskForm.elements.kind.value === 'group';
  $('assignee-select').hidden = group;
  $('assignee-checklist').hidden = !group;
}

/**
 * Opens the task form.
 *  - openTaskForm({})                → new task
 *  - openTaskForm({ dueDate })       → new task on that date (from the calendar)
 *  - openTaskForm({ task })          → edit that task
 */
function openTaskForm({ task = null, dueDate = '' } = {}) {
  state.editingTask = task;
  taskForm.reset();
  taskFormErrors.hidden = true;
  const fields = taskForm.elements;

  // A group task may use a category chosen by its creator that is not in
  // our own list: add it as an extra option so editing keeps it.
  renderCategoryOptions($('task-category-select'), state.categories);
  if (task?.category && !state.categories.some((c) => c.id === task.category.id)) {
    const option = el('option', '', `${task.category.name} (set by creator)`);
    option.value = String(task.category.id);
    $('task-category-select').append(option);
  }

  if (task) {
    fields.title.value = task.title;
    fields.description.value = task.description;
    fields.status.value = task.status;
    fields.priority.value = task.priority;
    fields.categoryId.value = task.categoryId ? String(task.categoryId) : '';
    fields.dueDate.value = task.dueDate ?? '';
  } else {
    fields.priority.value = 'medium';
    fields.dueDate.value = dueDate;
  }

  // Admins choose who the task is for.
  $('assign-fields').hidden = !isAdmin();
  if (isAdmin()) {
    const assigneeIds = task ? task.assignees.map((a) => a.id) : [state.user.id];
    fields.kind.value = assigneeIds.length > 1 ? 'group' : 'individual';
    $('assignee-select').value = String(assigneeIds[0] ?? state.user.id);
    for (const box of taskForm.querySelectorAll('input[name="assignees"]')) {
      box.checked = assigneeIds.includes(Number(box.value));
    }
    updateAssignControls();
  }

  $('task-dialog-title').textContent = task ? 'Edit task' : 'New task';
  $('task-submit').textContent = task ? 'Save changes' : 'Create task';
  taskDialog.showModal();
  fields.title.focus();
}

/** Reads the form fields into the object shape the API expects. */
function readTaskForm() {
  const fields = taskForm.elements;
  const data = {
    title: fields.title.value,
    description: fields.description.value,
    status: fields.status.value,
    priority: fields.priority.value,
    categoryId: fields.categoryId.value ? Number(fields.categoryId.value) : null,
    dueDate: fields.dueDate.value || null,
  };
  if (isAdmin()) {
    if (fields.kind.value === 'group') {
      data.assigneeIds = [...taskForm.querySelectorAll('input[name="assignees"]:checked')].map((box) => Number(box.value));
      if (data.assigneeIds.length < 2) {
        throw new Error('Choose at least two people for a group task (or pick "Individual").');
      }
    } else {
      data.assigneeIds = [Number($('assignee-select').value)];
    }
  }
  return data;
}

async function submitTaskForm(event) {
  event.preventDefault(); // stop the browser from reloading the page
  const submitButton = $('task-submit');
  submitButton.disabled = true;
  taskFormErrors.hidden = true;

  try {
    const data = readTaskForm();
    if (state.editingTask === null) {
      await api.createTask(data);
      showToast('Task created', 'success');
    } else {
      await api.updateTask(state.editingTask.id, data);
      showToast('Task updated', 'success');
    }
    taskDialog.close();
    await Promise.all([loadCurrentView(), loadCategories()]);
  } catch (error) {
    showFormErrors(taskFormErrors, error);
  } finally {
    submitButton.disabled = false;
  }
}

// ===================== Task actions =====================

async function toggleTask(task) {
  try {
    if (task.status === 'completed') {
      await api.reopenTask(task.id);
      showToast('Task reopened');
    } else {
      await api.completeTask(task.id);
      showToast('Task completed', 'success');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
  await loadCurrentView();
}

async function removeTask(task) {
  const confirmed = await confirmAction(`Delete the task "${task.title}"? This cannot be undone.`);
  if (!confirmed) return;
  try {
    await api.deleteTask(task.id);
    showToast('Task deleted', 'success');
    await Promise.all([loadCurrentView(), loadCategories()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ----- Subtasks -----

async function addSubtask(task, title) {
  try {
    await api.addSubtask(task.id, title);
  } catch (error) {
    showToast(error.details?.[0]?.message ?? error.message, 'error');
  }
  await loadCurrentView();
}

async function toggleSubtask(subtask) {
  try {
    await api.updateSubtask(subtask.id, { done: !subtask.done });
  } catch (error) {
    showToast(error.message, 'error');
  }
  await loadCurrentView();
}

async function removeSubtask(subtask) {
  try {
    await api.deleteSubtask(subtask.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
  await loadCurrentView();
}

// ===================== Category actions =====================

async function submitCategoryForm(event) {
  event.preventDefault();
  const fields = categoryForm.elements;
  try {
    await api.createCategory({ name: fields.name.value, color: fields.color.value });
    showToast('Category added', 'success');
    categoryForm.reset();
    await loadCategories();
  } catch (error) {
    showToast(error.details?.[0]?.message ?? error.message, 'error');
  }
}

async function saveCategory(category, changes) {
  try {
    await api.updateCategory(category.id, changes);
    showToast('Category saved', 'success');
    await Promise.all([loadCategories(), loadCurrentView()]);
  } catch (error) {
    showToast(error.details?.[0]?.message ?? error.message, 'error');
  }
}

async function removeCategory(category) {
  categoryDialog.close();
  const confirmed = await confirmAction(
    `Delete the category "${category.name}"? Its ${category.taskCount} task(s) will be kept without a category.`,
  );
  if (confirmed) {
    try {
      await api.deleteCategory(category.id);
      showToast('Category deleted', 'success');
      if (state.filters.categoryId === String(category.id)) state.filters.categoryId = '';
      await Promise.all([loadCategories(), loadCurrentView()]);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
  categoryDialog.showModal();
}

// ===================== Authentication =====================

/** Shows the login (or register) screen and hides the application. */
function showAuthScreen(mode = 'login') {
  state.user = null;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  $('app-screen').hidden = true;
  $('auth-screen').hidden = false;
  $('login-form').hidden = mode !== 'login';
  $('register-form').hidden = mode !== 'register';
  $('login-errors').hidden = true;
  $('register-errors').hidden = true;
  const form = mode === 'login' ? $('login-form') : $('register-form');
  form.querySelector('input').focus();
}

/** Shows the application for a logged-in user, starting from a clean state. */
async function showApp(user) {
  state.user = user;
  state.users = [];
  state.adminAssigneeFilter = '';
  $('auth-screen').hidden = true;
  $('app-screen').hidden = false;
  renderCurrentUser(user);
  resetDashboard();
  resetFilterControls();
  await loadCategories();
  if (isAdmin()) await loadUsers().catch(() => {}); // needed by the assignee picker
  showView(viewFromHash());
}

async function submitLogin(event) {
  event.preventDefault();
  const form = $('login-form');
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const user = await api.login(form.elements.email.value, form.elements.password.value);
    form.reset();
    showToast(`Welcome back, ${user.name}!`, 'success');
    await showApp(user);
  } catch (error) {
    showFormErrors($('login-errors'), error);
  } finally {
    submit.disabled = false;
  }
}

async function submitRegister(event) {
  event.preventDefault();
  const form = $('register-form');
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const fields = form.elements;
    const user = await api.register(fields.name.value, fields.email.value, fields.password.value);
    form.reset();
    showToast(`Account created. Welcome, ${user.name}!`, 'success');
    await showApp(user);
  } catch (error) {
    showFormErrors($('register-errors'), error);
  } finally {
    submit.disabled = false;
  }
}

async function logout() {
  try {
    await api.logout();
  } catch {
    // Even if the request fails, we still leave the app screen.
  }
  showToast('You have been logged out.');
  showAuthScreen('login');
}

// ===================== Filters (Tasks view) =====================

function updateOrderButton() {
  $('filter-order').textContent = state.filters.order === 'asc' ? '↑ Asc' : '↓ Desc';
}

function setFilter(key, value) {
  state.filters[key] = value;
  loadTasks();
}

// Waits until the user stops typing for 300 ms before searching,
// so we do not send a request for every single key press.
let searchTimer;
function onSearchInput(event) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setFilter('search', event.target.value.trim()), 300);
}

/** Puts every filter back to its default value (without loading). */
function resetFilterControls() {
  state.filters = { ...DEFAULT_FILTERS };
  $('filter-search').value = '';
  for (const key of ['status', 'priority', 'kind', 'category', 'due']) $(`filter-${key}`).value = '';
  $('filter-sort').value = 'createdAt';
  updateOrderButton();
}

function clearFilters() {
  resetFilterControls();
  loadTasks();
}

// ===================== Wiring events =====================

function bindEvents() {
  $('open-new-task').addEventListener('click', () => openTaskForm({}));
  $('open-categories').addEventListener('click', () => categoryDialog.showModal());
  taskForm.addEventListener('submit', submitTaskForm);
  for (const radio of taskForm.querySelectorAll('input[name="kind"]')) {
    radio.addEventListener('change', updateAssignControls);
  }
  categoryForm.addEventListener('submit', submitCategoryForm);
  $('retry').addEventListener('click', loadTasks);

  // Every button with data-close closes the dialog it is inside.
  for (const closeButton of document.querySelectorAll('[data-close]')) {
    closeButton.addEventListener('click', () => closeButton.closest('dialog').close());
  }

  // Views
  window.addEventListener('hashchange', () => {
    if (state.user) showView(viewFromHash());
  });

  // Tasks view filters
  $('filter-search').addEventListener('input', onSearchInput);
  $('filter-status').addEventListener('change', (e) => setFilter('status', e.target.value));
  $('filter-priority').addEventListener('change', (e) => setFilter('priority', e.target.value));
  $('filter-kind').addEventListener('change', (e) => setFilter('kind', e.target.value));
  $('filter-category').addEventListener('change', (e) => setFilter('categoryId', e.target.value));
  $('filter-due').addEventListener('change', (e) => setFilter('due', e.target.value));
  $('filter-sort').addEventListener('change', (e) => setFilter('sort', e.target.value));
  $('filter-order').addEventListener('click', () => {
    state.filters.order = state.filters.order === 'asc' ? 'desc' : 'asc';
    updateOrderButton();
    loadTasks();
  });
  $('filter-clear').addEventListener('click', clearFilters);

  // Calendar view
  $('cal-prev').addEventListener('click', () => moveCalendar(-1));
  $('cal-next').addEventListener('click', () => moveCalendar(1));
  $('cal-today').addEventListener('click', () => {
    state.calendarAnchor = api.localToday();
    loadCalendar();
  });
  for (const modeButton of document.querySelectorAll('[data-calendar-mode]')) {
    modeButton.addEventListener('click', () => setCalendarMode(modeButton.dataset.calendarMode));
  }

  // Admin view
  $('admin-filter-user').addEventListener('change', (e) => {
    state.adminAssigneeFilter = e.target.value;
    loadAdmin();
  });
  $('admin-assign').addEventListener('click', () => openTaskForm({}));

  // Authentication
  $('login-form').addEventListener('submit', submitLogin);
  $('register-form').addEventListener('submit', submitRegister);
  $('show-register').addEventListener('click', () => showAuthScreen('register'));
  $('show-login').addEventListener('click', () => showAuthScreen('login'));
  $('logout').addEventListener('click', logout);
}

// ===================== Start =====================

/** Asks the server whether we are already logged in (the cookie may still be valid). */
async function start() {
  bindEvents();
  // If any later request says "401", the session has ended: go back to login.
  api.onUnauthorized(() => {
    if (state.user) showToast('Your session has ended. Please log in again.', 'error');
    showAuthScreen('login');
  });

  try {
    await showApp(await api.getMe());
  } catch (error) {
    showAuthScreen('login');
    if (error.status !== 401) showToast(error.message, 'error');
  }
}

start();
