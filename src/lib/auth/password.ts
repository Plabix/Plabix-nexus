import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/** Hash of a random string, compared against when the email doesn't exist. */
let dummyHash: Promise<string> | null = null;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns the same bcrypt time as a real check, so login response time
 * doesn't reveal whether an email is registered.
 */
export async function verifyAgainstDummy(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash(`dummy-${Math.random()}`, SALT_ROUNDS);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}

/** Minimal password policy: 8+ chars. Kept simple and explicit. */
export function isPasswordStrongEnough(password: string): boolean {
  return password.length >= 8;
}
