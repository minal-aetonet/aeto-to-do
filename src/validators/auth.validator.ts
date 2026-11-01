import { z } from 'zod';

// Emails are trimmed and lower-cased BEFORE checking, so the same address
// typed with different capital letters always means the same account.
const email = z
  .string({ message: 'Email must be text' })
  .trim()
  .toLowerCase()
  .max(254, { message: 'Email is too long' })
  .pipe(z.email({ message: 'Enter a valid email address' }));

/** Body of POST /api/auth/register. */
export const registerSchema = z.object({
  name: z
    .string({ message: 'Name must be text' })
    .trim()
    .min(1, { message: 'Name is required' })
    .max(50, { message: 'Name must be 50 characters or fewer' }),
  email,
  // A maximum length stops attackers sending huge strings to the slow hash function.
  password: z
    .string({ message: 'Password must be text' })
    .min(8, { message: 'Password must be at least 8 characters' })
    .max(128, { message: 'Password must be 128 characters or fewer' }),
});

/** Body of POST /api/auth/login. Rules are minimal: we never hint at what a valid password looks like. */
export const loginSchema = z.object({
  email,
  password: z
    .string({ message: 'Password must be text' })
    .min(1, { message: 'Password is required' })
    .max(128, { message: 'Password must be 128 characters or fewer' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
