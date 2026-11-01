/**
 * Slows down password guessing ("brute-force attacks").
 *
 * It remembers failed logins per email address in memory. After `maxFailures`
 * failures within `windowMs`, further attempts for that email are refused
 * until the window has passed. A successful login clears the counter.
 *
 * Kept in memory on purpose (simple, no database writes); it resets when the
 * server restarts, and each running server has its own counter.
 */
export class LoginThrottle {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly failures = new Map<string, { count: number; firstFailureAt: number }>();

  constructor(maxFailures = 5, windowMs = 15 * 60 * 1000) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
  }

  /** True when this key has failed too often recently. */
  isBlocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstFailureAt > this.windowMs) {
      this.failures.delete(key); // the window has passed: forget the old failures
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const entry = this.failures.get(key);
    if (!entry || Date.now() - entry.firstFailureAt > this.windowMs) {
      this.failures.set(key, { count: 1, firstFailureAt: Date.now() });
    } else {
      entry.count++;
    }
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
