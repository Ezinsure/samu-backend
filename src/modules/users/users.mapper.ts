import type { Prisma } from "@prisma/client";

/** Columns the admin user views need (never includes the password hash). */
export const userRowInclude = {
  agent: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserInclude;

type UserRow = Prisma.UserGetPayload<{ include: typeof userRowInclude }>;

/** Admin-facing user shape. */
export function toUserRow(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    avatarInitials: user.avatarInitials,
    agentId: user.agentId,
    agentName: user.agent ? `${user.agent.name} (${user.agent.code})` : null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
