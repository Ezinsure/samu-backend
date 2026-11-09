import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import {
  uploadProfileAvatar,
} from "../../lib/storage.js";
import type { ChangePasswordBody, UpdateProfileBody } from "./auth.schemas.js";
import {
  initialsFromName,
  issueSession,
  toPublicUser,
  type AuthSession,
  type PublicUser,
} from "./auth.service.js";

type RequestMeta = { ip?: string; userAgent?: string };

const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function maskNid(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) {
    throw errors.badRequest("National ID must include at least 4 digits");
  }
  return `1********${digits.slice(-3)}`;
}

/** Update the signed-in user's own profile fields. */
export async function updateOwnProfile(
  userId: string,
  input: UpdateProfileBody,
  meta?: RequestMeta,
): Promise<PublicUser> {
  const data: {
    name?: string;
    phone?: string | null;
    workingProvince?: string | null;
    workingDistrict?: string | null;
    nidMasked?: string | null;
    avatarInitials?: string;
  } = {};

  if (input.name !== undefined) {
    data.name = input.name;
    data.avatarInitials = initialsFromName(input.name);
  }
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.workingProvince !== undefined) {
    data.workingProvince = input.workingProvince;
  }
  if (input.workingDistrict !== undefined) {
    data.workingDistrict = input.workingDistrict;
  }
  if (input.nid !== undefined) {
    data.nidMasked = input.nid === null ? null : maskNid(input.nid);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
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
 * Upload a profile photo to R2 and store the object key on the user.
 */
export async function uploadOwnAvatar(
  userId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  meta?: RequestMeta,
): Promise<PublicUser> {
  if (!ALLOWED_AVATAR_TYPES.has(file.mimetype)) {
    throw errors.badRequest("Avatar must be a JPEG, PNG, or WebP image");
  }
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) {
    throw errors.badRequest("Avatar must be between 1 byte and 2 MB");
  }

  const uploaded = await uploadProfileAvatar({
    uploaderUserId: userId,
    fileName: file.originalname || "avatar.jpg",
    contentType: file.mimetype,
    body: file.buffer,
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: uploaded.storageKey },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "user.avatar_upload",
    objectType: "user",
    objectId: userId,
    summary: `${updated.name} uploaded a profile photo.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicUser(updated);
}

/** Clear the stored avatar key (object may remain in R2). */
export async function removeOwnAvatar(
  userId: string,
  meta?: RequestMeta,
): Promise<PublicUser> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "user.avatar_remove",
    objectType: "user",
    objectId: userId,
    summary: `${updated.name} removed their profile photo.`,
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
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    }),
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
