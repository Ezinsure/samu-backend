import type { User } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  ttlToMs,
} from "../../lib/tokens.js";
import { env } from "../../config/env.js";
import type { LoginBody, RegisterBody } from "./auth.schemas.js";

/** Safe user shape returned by auth endpoints (never includes passwordHash). */
export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: User["role"];
  status: User["status"];
  phone: string | null;
  avatarInitials: string | null;
  agentId: string | null;
  lastLoginAt: Date | null;
};

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    phone: user.phone,
    avatarInitials: user.avatarInitials,
    agentId: user.agentId,
    lastLoginAt: user.lastLoginAt,
  };
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export type AuthSession = {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
};

/**
 * Create a pending AGENT account. Caller cannot log in until status → active.
 */
export async function registerUser(input: RegisterBody): Promise<PublicUser> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw errors.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash,
      role: "AGENT",
      status: "pending",
      avatarInitials: initialsFromName(input.name),
    },
  });

  logger.info({ userId: user.id, email: user.email }, "User registered (pending)");
  return toPublicUser(user);
}

/**
 * Authenticate an active user and issue a new access + refresh pair.
 */
export async function loginUser(
  input: LoginBody,
  meta?: { ip?: string; userAgent?: string },
): Promise<AuthSession> {
  const { writeAuditLog } = await import("../../lib/audit.js");
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Generic message — do not reveal whether email exists.
  const failCredentials = async (): Promise<never> => {
    logger.warn({ email: input.email }, "Login failed");
    await writeAuditLog({
      actorUserId: user?.id,
      action: "user.login_failed",
      objectType: "user",
      objectId: user?.id ?? input.email,
      summary: `Failed login attempt for ${input.email}.`,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    throw errors.unauthorized("Invalid email or password");
  };

  if (!user) {
    return failCredentials();
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    return failCredentials();
  }

  if (user.status === "pending") {
    throw errors.forbidden("Account pending activation");
  }
  if (user.status === "disabled") {
    throw errors.forbidden("Account disabled");
  }
  if (user.status !== "active") {
    return failCredentials();
  }

  const session = await issueSession(user);
  const lastLoginAt = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "user.login",
    objectType: "user",
    objectId: user.id,
    summary: `${user.name} signed in.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  logger.info({ userId: user.id, role: user.role }, "Login success");
  return {
    ...session,
    user: { ...session.user, lastLoginAt },
  };
}

/**
 * Rotate refresh token: revoke the presented one, issue a new pair.
 */
export async function refreshSession(rawRefresh: string): Promise<AuthSession> {
  const tokenHash = hashRefreshToken(rawRefresh);
  const stored = await prisma.refreshToken.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!stored) {
    throw errors.unauthorized("Invalid or expired refresh token");
  }

  if (stored.user.status !== "active") {
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    throw errors.unauthorized("Invalid or expired refresh token");
  }

  // Rotate: revoke old token before issuing a new one.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  return issueSession(stored.user);
}

/**
 * Revoke the presented refresh token (logout). Access cookie is cleared by controller.
 */
export async function logoutSession(rawRefresh: string | undefined): Promise<void> {
  if (!rawRefresh) return;

  const tokenHash = hashRefreshToken(rawRefresh);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  logger.info("Refresh token revoked (logout)");
}

/** Load current user by id for GET /me. */
export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "active") {
    throw errors.unauthorized();
  }
  return toPublicUser(user);
}

/**
 * Create access JWT + store hashed refresh token; return both raw tokens.
 */
async function issueSession(user: User): Promise<AuthSession> {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
  });

  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL));

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    },
  });

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}
