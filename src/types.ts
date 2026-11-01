import type { AppDatabase } from './db';
import type { LoginThrottle } from './lib/login-throttle';
import type { PublicUser } from './services/auth.service';

/** Settings the authentication routes need. */
export type AuthSettings = {
  /** Send the session cookie only over HTTPS. Must be true in production. */
  secureCookies: boolean;
  loginThrottle: LoginThrottle;
};

// Describes the "environment" of our Hono app for TypeScript.
// Variables are values that middleware stores on the context with c.set()
// and that route handlers read back with c.get().
export type AppEnv = {
  Variables: {
    db: AppDatabase;
    auth: AuthSettings;
    /** The logged-in user. Only set on routes protected by requireAuth. */
    user: PublicUser;
  };
};
