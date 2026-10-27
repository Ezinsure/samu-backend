import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "@prisma/client";

export type AccessTokenPayload = {
  sub: string;
  role: UserRole;
  email: string;
  typ: "access";
};

/**
 * Parse TTL strings like `15m`, `7d`, `3600s` into milliseconds.
 */
export function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/i.exec(ttl.trim());
  if (!match) {
    throw new Error(`Invalid TTL format: ${ttl}`);
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit]!;
}

/** Sign a short-lived access JWT for cookie `samu_access`. */
export function signAccessToken(payload: Omit<AccessTokenPayload, "typ">): string {
  return jwt.sign(
    { ...payload, typ: "access" satisfies AccessTokenPayload["typ"] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL } as jwt.SignOptions,
  );
}

/** Verify and decode an access JWT; throws if invalid/expired. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.typ !== "access" || !decoded.sub || !decoded.role) {
    throw new Error("Invalid access token payload");
  }
  return decoded;
}

/**
 * Random URL-safe token for one-time links (password reset / invite).
 * Only its hash (`hashRefreshToken`) is stored in the database.
 */
export function generateOneTimeToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Opaque refresh token (random) — only the hash is stored in DB. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

/** SHA-256 hex hash of a refresh token for storage/lookup. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
