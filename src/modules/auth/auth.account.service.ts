import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import type { ChangePasswordBody, UpdateProfileBody } from "./auth.schemas.js";
import {
  initialsFromName,
  issueSession,
  toPublicUser,
  type AuthSession,
  type PublicUser,
} from "./auth.service.js";

type RequestMeta = { ip?: string; userAgent?: string };

/** Update the signed-in user's own name / phone. */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileBody,
  meta?: RequestMeta,
): Promise<PublicUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      phone: input.phone,
      // Keep the avatar initials in sync with the display name.
      avatarInitials: input.name ? initialsFromName(input.name) : undefined,
    },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "user.profile_update",
    objectType: "user",
    objectId: userId,
    summary: `${updated.name} updated their profile.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicUser(updated);
}

/**
 * Change the signed-in user's password after verifying the current one.
 * All existing sessions are revoked and a fresh session is returned so the
 * caller stays signed in on this device only.
 */
export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordBody,
  meta?: RequestMeta,
): Promise<AuthSession> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "active") throw errors.unauthorized();

  // 400 (not 401): a wrong current password must not look like an expired session.
  const ok = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!ok) throw errors.badRequest("Current password is incorrect");

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date();

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditLog({
    actorUserId: userId,
    action: "user.password_change",
    objectType: "user",
    objectId: userId,
    summary: `${updated.name} changed their password.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return issueSession(updated);
}
