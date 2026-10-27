import { Prisma, type User } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { AppError, errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { generateOneTimeToken } from "../../lib/tokens.js";
import type { AuthUser } from "../../types/express.js";
import { initialsFromName } from "../auth/auth.service.js";
import { sendPasswordLink } from "../auth/password-reset.service.js";
import { toUserRow, userRowInclude } from "./users.mapper.js";
import type {
  UserCreateInput,
  UserListQuery,
  UserUpdateInput,
} from "./users.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

/** Outcome of the set-password email sent on account creation. */
export type InviteStatus = "none" | "sent" | "not_configured" | "failed";

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") throw errors.forbidden("Only ADMIN can manage users");
}

async function loadUser(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw errors.notFound("User not found");
  return user;
}

/** An agent record can back at most one portal login. */
async function assertAgentLinkable(agentId: string, exceptUserId?: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true },
  });
  if (!agent) throw errors.badRequest("agentId does not exist");

  const linked = await prisma.user.findFirst({
    where: { agentId, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) },
    select: { id: true },
  });
  if (linked) throw errors.conflict("That agent already has a portal login");
}

async function assertEmailFree(email: string, exceptUserId?: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== exceptUserId) {
    throw errors.conflict("An account with this email already exists");
  }
}

/** Revoke every refresh token so a disabled/reset account is signed out. */
function revokeSessions(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function listUsers(query: UserListQuery, actor: AuthUser) {
  requireAdmin(actor);

  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { email: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: userRowInclude,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data: rows.map(toUserRow),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getUser(id: string, actor: AuthUser) {
  requireAdmin(actor);
  const user = await prisma.user.findUnique({
    where: { id },
    include: userRowInclude,
  });
  if (!user) throw errors.notFound("User not found");
  return toUserRow(user);
}

/**
 * Create an active account. With a password the admin hands credentials over;
 * without one the user receives a set-password link by email.
 */
export async function createUser(
  input: UserCreateInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  await assertEmailFree(input.email);

  const agentId = input.role === "AGENT" ? (input.agentId ?? null) : null;
  if (input.role !== "AGENT" && input.agentId) {
    throw errors.badRequest("Only AGENT users can be linked to an agent");
  }
  if (agentId) await assertAgentLinkable(agentId);

  // No password supplied → store an unguessable one; the invite link replaces it.
  const passwordHash = await hashPassword(input.password ?? generateOneTimeToken());

  const created = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone ?? null,
      role: input.role,
      status: "active",
      passwordHash,
      avatarInitials: initialsFromName(input.name),
      agentId,
    },
    include: userRowInclude,
  });

  let invite: InviteStatus = "none";
  if (!input.password) {
    try {
      const result = await sendPasswordLink(created, "invite");
      invite = result.delivered ? "sent" : "not_configured";
    } catch (error) {
      logger.error({ err: error, userId: created.id }, "Failed to send invite email");
      invite = "failed";
    }
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.create",
    objectType: "user",
    objectId: created.id,
    summary: `${actor.name} created ${created.role} account for ${created.email}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { user: toUserRow(created), invite };
}

export async function updateUser(
  id: string,
  input: UserUpdateInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const target = await loadUser(id);

  const nextRole = input.role ?? target.role;
  const roleChanged = input.role !== undefined && input.role !== target.role;
  const statusChanged = input.status !== undefined && input.status !== target.status;

  // An admin must not lock themselves out or strip their own privileges.
  if (id === actor.id && (roleChanged || statusChanged)) {
    throw errors.badRequest("You cannot change your own role or status");
  }

  if (input.email && input.email !== target.email) {
    await assertEmailFree(input.email, id);
  }

  // Leaving the TC role while still coordinating agents/territories would orphan them.
  if (roleChanged && target.role === "TERRITORY_COORDINATOR") {
    const [agents, assignments] = await Promise.all([
      prisma.agent.count({ where: { tcUserId: id } }),
      prisma.territoryAssignment.count({ where: { tcUserId: id, active: true } }),
    ]);
    if (agents > 0 || assignments > 0) {
      throw errors.conflict(
        "Reassign this coordinator's agents and territories before changing their role",
      );
    }
  }

  if (input.agentId && nextRole !== "AGENT") {
    throw errors.badRequest("Only AGENT users can be linked to an agent");
  }
  // Moving away from AGENT clears the portal link.
  let agentId: string | null | undefined = input.agentId;
  if (nextRole !== "AGENT") agentId = null;
  if (agentId) await assertAgentLinkable(agentId, id);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      email: input.email,
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: input.status,
      agentId,
      avatarInitials: input.name ? initialsFromName(input.name) : undefined,
    },
    include: userRowInclude,
  });

  // Disabled / pending accounts lose their sessions immediately.
  if (statusChanged && input.status !== "active") {
    await revokeSessions(id);
  }

  const changes = Object.keys(input).filter(
    (key) => input[key as keyof UserUpdateInput] !== undefined,
  );
  await writeAuditLog({
    actorUserId: actor.id,
    action: statusChanged ? `user.${input.status}` : "user.update",
    objectType: "user",
    objectId: id,
    summary: `${actor.name} updated ${updated.email} (${changes.join(", ")}).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toUserRow(updated);
}

/** Admin sets a password directly (e.g. when email delivery is unavailable). */
export async function setUserPassword(
  id: string,
  password: string,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const target = await loadUser(id);
  const passwordHash = await hashPassword(password);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: id, usedAt: null },
      data: { usedAt: now },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.password_set_by_admin",
    objectType: "user",
    objectId: id,
    summary: `${actor.name} set a new password for ${target.email}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}

/** Admin triggers the forgot-password email for a user. */
export async function sendUserResetLink(
  id: string,
  actor: AuthUser,
  meta?: RequestMeta,
): Promise<{ delivered: boolean }> {
  requireAdmin(actor);
  const target = await loadUser(id);
  if (target.status !== "active") {
    throw errors.badRequest("Only active accounts can receive a reset link");
  }

  let result;
  try {
    result = await sendPasswordLink(target, "reset");
  } catch (error) {
    logger.error({ err: error, userId: id }, "Failed to send reset email");
    throw new AppError(502, "EMAIL_FAILED", "The email could not be sent. Try again later.");
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.password_reset_sent",
    objectType: "user",
    objectId: id,
    summary: `${actor.name} sent a password reset link to ${target.email}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { delivered: result.delivered };
}

/**
 * Permanently delete a user. Accounts with recorded activity (visits, leads,
 * reports…) are protected by foreign keys and must be deactivated instead.
 */
export async function deleteUser(id: string, actor: AuthUser, meta?: RequestMeta) {
  requireAdmin(actor);
  if (id === actor.id) throw errors.badRequest("You cannot delete your own account");
  const target = await loadUser(id);

  try {
    await prisma.user.delete({ where: { id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2003" || error.code === "P2014")
    ) {
      throw errors.conflict(
        "This user has recorded activity and cannot be deleted. Deactivate the account instead.",
      );
    }
    throw error;
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.delete",
    objectType: "user",
    objectId: id,
    summary: `${actor.name} deleted ${target.role} account ${target.email}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
}
