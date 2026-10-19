import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getSettings } from "../../lib/settings.js";
import type { AuthUser } from "../../types/express.js";
import type { MessageListQuery, SendSmsInput } from "./messaging.schemas.js";

function canMessage(role: AuthUser["role"]): boolean {
  return role === "ADMIN" || role === "OPERATIONS_MANAGER";
}

/**
 * Stub SMS send — records outbox row; no external gateway.
 * Marks as stub_sent immediately so the queue is inspectable.
 */
export async function sendSms(
  input: SendSmsInput,
  viewer: AuthUser,
  meta?: { ip?: string; userAgent?: string },
) {
  if (!canMessage(viewer.role)) {
    throw errors.forbidden();
  }

  const settings = await getSettings();
  let body = input.body?.trim() ?? "";
  if (!body && input.templateId) {
    body = settings.smsTemplates[input.templateId] ?? "";
  }
  if (!body) {
    throw errors.badRequest("Unknown template or empty message body");
  }

  if (input.visitId) {
    const visit = await prisma.visit.findUnique({ where: { id: input.visitId } });
    if (!visit) throw errors.badRequest("visitId does not exist");
  }
  if (input.agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!agent) throw errors.badRequest("agentId does not exist");
  }

  const message = await prisma.messageOutbox.create({
    data: {
      toPhone: input.toPhone,
      body,
      templateId: input.templateId ?? null,
      status: "stub_sent",
      visitId: input.visitId ?? null,
      agentId: input.agentId ?? null,
      createdById: viewer.id,
      providerRef: `stub-${Date.now()}`,
    },
  });

  await writeAuditLog({
    actorUserId: viewer.id,
    action: "messaging.sms_stub",
    objectType: "message_outbox",
    objectId: message.id,
    summary: `Stub SMS queued/sent to ${input.toPhone} (${input.templateId ?? "custom"}).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  logger.info(
    { messageId: message.id, to: input.toPhone, provider: "stub" },
    "Stub SMS recorded (no gateway)",
  );

  return {
    id: message.id,
    status: message.status,
    provider: "stub" as const,
    toPhone: message.toPhone,
    body: message.body,
    templateId: message.templateId ?? undefined,
    providerRef: message.providerRef ?? undefined,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function listMessages(
  query: MessageListQuery,
  viewer: AuthUser,
) {
  if (!canMessage(viewer.role)) throw errors.forbidden();

  const where: Prisma.MessageOutboxWhereInput = {};
  if (query.status) where.status = query.status;

  const total = await prisma.messageOutbox.count({ where });
  const rows = await prisma.messageOutbox.findMany({
    where,
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => ({
      id: row.id,
      toPhone: row.toPhone,
      body: row.body,
      templateId: row.templateId ?? undefined,
      status: row.status,
      visitId: row.visitId ?? undefined,
      agentId: row.agentId ?? undefined,
      providerRef: row.providerRef ?? undefined,
      createdByName: row.createdBy?.name,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getMessagingStatus(viewer: AuthUser) {
  if (!canMessage(viewer.role)) throw errors.forbidden();
  const settings = await getSettings();
  const queued = await prisma.messageOutbox.count({
    where: { status: "stub_queued" },
  });
  return {
    provider: "stub",
    enabled: true,
    note: "No external SMS gateway configured. Messages are recorded locally only.",
    templates: Object.keys(settings.smsTemplates),
    queued,
  };
}
