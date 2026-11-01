// api.js — every conversation between the browser and the Hono server lives here.
// Other files call these functions instead of using fetch() directly.

/** An error from the API, carrying the HTTP status and validation details. */
export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Called when the server answers 401 (not logged in / session expired).
// app.js registers a function here that shows the login screen.
let unauthorizedHandler = null;
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

/**
 * Sends an HTTP request to our API and returns the "data" part of the reply.
 * Throws ApiError when the server answers with an error status.
 * The browser automatically sends the session cookie with every request to
 * our own server, so we never handle the login token in JavaScript.
 */
async function request(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch() only throws when the server cannot be reached at all.
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }

  // 204 No Content has no body to read.
  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    // A 401 from a normal API call means our session is gone. (Auth routes are
    // excluded: a 401 from /login just means "wrong password".)
    if (response.status === 401 && !path.startsWith('/api/auth/') && unauthorizedHandler) {
      unauthorizedHandler();
    }
    throw new ApiError(error?.message ?? `Request failed (${response.status})`, response.status, error?.details);
  }
  return payload.data;
}

/** A JavaScript Date as "YYYY-MM-DD" in the user's own time zone. */
export function toDateString(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today's date in the user's own time zone, as "YYYY-MM-DD". */
export function localToday() {
  return toDateString(new Date());
}

/** "YYYY-MM-DD" moved by a number of days (negative = earlier). */
export function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  return toDateString(new Date(year, month - 1, day + days));
}

/** Turns { status: 'pending', search: '' } into "?status=pending" (empty values skipped). */
function toQueryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value !== undefined && value !== null) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

// ----- Authentication -----
export const getMe = () => request('/api/auth/me');
export const login = (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } });
export const register = (name, email, password) =>
  request('/api/auth/register', { method: 'POST', body: { name, email, password } });
export const logout = () => request('/api/auth/logout', { method: 'POST' });

// ----- Admin -----
export const getUsers = () => request('/api/admin/users');
export const getAdminTasks = (filters) => request(`/api/admin/tasks${toQueryString({ ...filters, today: localToday() })}`);

// ----- Subtasks (tasks inside a task) -----
export const addSubtask = (taskId, title) => request(`/api/tasks/${taskId}/subtasks`, { method: 'POST', body: { title } });
export const updateSubtask = (id, changes) => request(`/api/subtasks/${id}`, { method: 'PATCH', body: changes });
export const deleteSubtask = (id) => request(`/api/subtasks/${id}`, { method: 'DELETE' });

// ----- Tasks -----
export const getTasks = (filters) => request(`/api/tasks${toQueryString({ ...filters, today: localToday() })}`);
export const createTask = (task) => request('/api/tasks', { method: 'POST', body: task });
export const updateTask = (id, changes) => request(`/api/tasks/${id}`, { method: 'PATCH', body: changes });
export const deleteTask = (id) => request(`/api/tasks/${id}`, { method: 'DELETE' });
export const completeTask = (id) => request(`/api/tasks/${id}/complete`, { method: 'POST' });
export const reopenTask = (id) => request(`/api/tasks/${id}/reopen`, { method: 'POST' });

// ----- Categories -----
export const getCategories = () => request('/api/categories');
export const createCategory = (category) => request('/api/categories', { method: 'POST', body: category });
export const updateCategory = (id, changes) => request(`/api/categories/${id}`, { method: 'PATCH', body: changes });
export const deleteCategory = (id) => request(`/api/categories/${id}`, { method: 'DELETE' });

// ----- Dashboard -----
export const getDashboard = () => request(`/api/dashboard${toQueryString({ today: localToday() })}`);
