import type { Prisma } from "@prisma/client";
import { getSignedObjectUrl } from "../../lib/storage.js";
import { logger } from "../../lib/logger.js";

/** Columns the admin user views need (never includes the password hash). */
export const userRowInclude = {
  agent: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userRowInclude }>;

async function signedAvatar(keyOrUrl: string | null): Promise<string | null> {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  try {
    return await getSignedObjectUrl(keyOrUrl, 12 * 60 * 60);
  } catch (error) {
    logger.warn({ err: error }, "Could not sign user list avatar");
    return null;
  }
}

/** Admin-facing user shape. */
export async function toUserRow(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarInitials: user.avatarInitials,
    avatarUrl: await signedAvatar(user.avatarUrl),
    nidMasked: user.nidMasked,
    workingDistrict: user.workingDistrict,
    workingProvince: user.workingProvince,
    agentId: user.agentId,
    agentName: user.agent ? `${user.agent.name} (${user.agent.code})` : null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
