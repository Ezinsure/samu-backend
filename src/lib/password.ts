import argon2 from "argon2";

/**
 * Hash a plaintext password with Argon2id (OWASP-recommended defaults).
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/**
 * Verify a plaintext password against a stored Argon2id hash.
 * Returns false on mismatch or malformed hash (never throws for bad input).
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
