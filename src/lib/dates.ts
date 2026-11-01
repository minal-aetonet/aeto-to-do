/** The current moment as an ISO 8601 string, e.g. "2026-11-01T09:30:00.000Z". */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Today's date on the server, in local time, as "YYYY-MM-DD".
 * Used when the browser does not tell us its own local date.
 */
export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
