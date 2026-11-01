import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt is a password-hashing function built into Node.js. It is deliberately
// SLOW and memory-hungry, so an attacker who steals the database needs a very
// long time to guess passwords. promisify() turns its callback API into a Promise.
const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Turns a password into a string that is safe to store:
 *   "scrypt:<salt in hex>:<hash in hex>"
 * The random salt makes the result different every time, even for the same
 * password, so identical passwords cannot be spotted in the database.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Checks a password against a stored hash. Returns true if it matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, hashHex] = stored.split(':');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  // timingSafeEqual takes the same time whether the first or the last byte
  // differs, so attackers cannot learn anything by measuring response times.
  return timingSafeEqual(actual, expected);
}
