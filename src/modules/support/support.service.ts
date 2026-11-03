import { z } from "zod";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

export const supportCreateSchema = z.object({
  agentId: z.string().min(1),
  supportedAt: z.string().datetime().optional(),
  channel: z.enum(["phone", "whatsapp", "in_person", "other"]).default("phone"),
  summary: z.string().trim().min(1).max(4000),
  outcome: z.string().trim().max(4000).optional(),
});

export async function createSupportLog(
  input: z.infer<typeof supportCreateSchema>,
  actor: AuthUser,
) {
  if (actor.role !== "ADMIN" && actor.role !== "TERRITORY_COORDINATOR") {
    throw errors.forbidden();
  }

  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
  if (!agent) throw errors.notFound("Agent not found");
  if (
    actor.role === "TERRITORY_COORDINATOR" &&
    agent.tcUserId !== actor.id
  ) {
    throw errors.forbidden();
  }

  const row = await prisma.supportLog.create({
    data: {
      tcUserId: actor.role === "ADMIN" ? (agent.tcUserId ?? actor.id) : actor.id,
      agentId: input.agentId,
      supportedAt: input.supportedAt ? new Date(input.supportedAt) : new Date(),
      channel: input.channel,
      summary: input.summary,
      outcome: input.outcome ?? null,
    },
    include: {
      agent: { select: { name: true, code: true } },
      tcUser: { select: { name: true } },
    },
  });

  return {
    id: row.id,
    agentId: row.agentId,
    agentName: row.agent.name,
    agentCode: row.agent.code,
    tcUserId: row.tcUserId,
    tcName: row.tcUser.name,
    supportedAt: row.supportedAt.toISOString(),
    channel: row.channel,
    summary: row.summary,
    outcome: row.outcome ?? undefined,
  };
}

export async function listSupportLogs(actor: AuthUser, agentId?: string) {
  const where: { tcUserId?: string; agentId?: string } = {};
  if (actor.role === "TERRITORY_COORDINATOR") where.tcUserId = actor.id;
  if (agentId) where.agentId = agentId;

  const rows = await prisma.supportLog.findMany({
    where,
    include: {
      agent: { select: { name: true, code: true } },
      tcUser: { select: { name: true } },
    },
    orderBy: { supportedAt: "desc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    agentId: row.agentId,
    agentName: row.agent.name,
    agentCode: row.agent.code,
    tcUserId: row.tcUserId,
    tcName: row.tcUser.name,
    supportedAt: row.supportedAt.toISOString(),
    channel: row.channel,
    summary: row.summary,
    outcome: row.outcome ?? undefined,
  }));
}
