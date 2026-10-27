import type { User } from "@prisma/client";
import { env } from "../../config/env.js";
import { writeAuditLog } from "../../lib/audit.js";
import { accountInviteEmail, passwordResetEmail } from "../../lib/email-templates.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { sendMail, type MailResult } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import {
  generateOneTimeToken,
  hashRefreshToken,
  ttlToMs,
} from "../../lib/tokens.js";
import type { ForgotPasswordBody, ResetPasswordBody } from "./auth.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

/** "1h" → "1 hour", "3d" → "3 days" (for email copy). */
function describeTtl(ttl: string): string {
  const match = /^(\d+)([smhd])$/i.exec(ttl.trim());
  if (!match) return ttl;
  const amount = Number(match[1]);
  const names: Record<string, string> = {
    s: "second",
    m: "minute",
    h: "hour",
    d: "day",
  };
  const unit = names[match[2]!.toLowerCase()]!;
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

/**
 * Create a one-time token for a user, superseding any unused earlier ones.
 * Returns the raw token (emailed to the user); only its hash is stored.
 */
async function createOneTimeLink(userId: string, ttl: string): Promise<string> {
  await prisma.passwordResetToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generateOneTimeToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + ttlToMs(ttl)),
    },
  });
  return token;
}

/**
 * Email a user a link to set a new password.
 * `reset` = forgot-password flow; `invite` = new account created by an admin.
 */
export async function sendPasswordLink(
  user: Pick<User, "id" | "email" | "name">,
  kind: "reset" | "invite",
): Promise<MailResult> {
  const ttl = kind === "reset" ? env.PASSWORD_RESET_TTL : env.PASSWORD_INVITE_TTL;
  const token = await createOneTimeLink(user.id, ttl);
  const link = `${env.FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

  const build = kind === "reset" ? passwordResetEmail : accountInviteEmail;
  return sendMail(
    build({
      to: user.email,
      name: user.name,
      link,
      validFor: describeTtl(ttl),
    }),
  );
}

/**
 * Public "forgot password" request. Always resolves without revealing
 * whether the email belongs to an account; delivery failures are only logged.
 */
export async function requestPasswordReset(
  input: ForgotPasswordBody,
  meta?: RequestMeta,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Only active accounts can reset; pending/disabled stay locked until an admin acts.
  if (!user || user.status !== "active") {
    logger.info({ email: input.email }, "Password reset requested for unknown/inactive account");
    return;
  }

  try {
    await sendPasswordLink(user, "reset");
  } catch (error) {
    logger.error({ err: error, userId: user.id }, "Failed to send password reset email");
    return;
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: "user.password_reset_requested",
    objectType: "user",
    objectId: user.id,
    summary: `Password reset requested for ${user.email}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}

/**
 * Consume a reset/invite token and set a new password.
 * Revokes every session so a stolen session cannot outlive the reset.
 */
export async function resetPassword(
  input: ResetPasswordBody,
  meta?: RequestMeta,
): Promise<void> {
  const now = new Date();
  const stored = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash: hashRefreshToken(input.token),
      usedAt: null,
      expiresAt: { gt: now },
    },
    include: { user: true },
  });

  if (!stored || stored.user.status !== "active") {
    throw errors.badRequest("This reset link is invalid or has expired");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.updateMany({
      where: { userId: stored.userId, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditLog({
    actorUserId: stored.userId,
    action: "user.password_reset",
    objectType: "user",
    objectId: stored.userId,
    summary: `${stored.user.name} reset their password via email link.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}
