import { z } from "zod";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

export const attendanceUploadSchema = z.object({
  title: z.string().trim().max(200).optional(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  emails: z.array(z.string().email()).min(1).max(500),
});

export async function uploadAttendance(
  input: z.infer<typeof attendanceUploadSchema>,
  actor: AuthUser,
) {
  if (actor.role !== "ADMIN") throw errors.forbidden();

  const normalized = input.emails.map((e) => e.trim().toLowerCase());
  const agents = await prisma.agent.findMany({
    where: {
      email: { in: normalized, mode: "insensitive" },
    },
    select: { id: true, email: true, tcUserId: true, name: true, code: true },
  });
  const byEmail = new Map(
    agents
      .filter((a) => a.email)
      .map((a) => [a.email!.toLowerCase(), a]),
  );

  const session = await prisma.trainingSession.create({
    data: {
      title: input.title ?? null,
      sessionDate: new Date(`${input.sessionDate}T00:00:00.000Z`),
      uploadedByUserId: actor.id,
      attendance: {
        create: normalized.map((email) => {
          const match = byEmail.get(email);
          return {
            email,
            agentId: match?.id ?? null,
            attended: true,
          };
        }),
      },
    },
    include: { attendance: true },
  });

  return {
    id: session.id,
    title: session.title,
    sessionDate: input.sessionDate,
    totalEmails: normalized.length,
    matchedAgents: session.attendance.filter((a) => a.agentId).length,
    unmatchedEmails: session.attendance
      .filter((a) => !a.agentId)
      .map((a) => a.email),
  };
}

export async function attendanceGaps(actor: AuthUser, sessionId?: string) {
  const session = sessionId
    ? await prisma.trainingSession.findUnique({ where: { id: sessionId } })
    : await prisma.trainingSession.findFirst({ orderBy: { sessionDate: "desc" } });

  if (!session) return { session: null, attended: [], missing: [] };

  const attendance = await prisma.trainingAttendance.findMany({
    where: { sessionId: session.id, attended: true, agentId: { not: null } },
    select: { agentId: true, email: true, followUpNote: true },
  });
  const attendedIds = new Set(
    attendance.map((a) => a.agentId).filter(Boolean) as string[],
  );

  const networkWhere =
    actor.role === "TERRITORY_COORDINATOR"
      ? { tcUserId: actor.id }
      : {};

  const network = await prisma.agent.findMany({
    where: {
      ...networkWhere,
      status: { not: "Inactive" },
    },
    select: {
      id: true,
      code: true,
      name: true,
      email: true,
      status: true,
      tcUserId: true,
    },
    orderBy: { name: "asc" },
  });

  return {
    session: {
      id: session.id,
      title: session.title,
      sessionDate: session.sessionDate.toISOString().slice(0, 10),
    },
    attended: network.filter((a) => attendedIds.has(a.id)),
    missing: network.filter((a) => !attendedIds.has(a.id)),
  };
}

export async function setFollowUpNote(
  attendanceId: string,
  note: string,
  actor: AuthUser,
) {
  if (actor.role !== "ADMIN" && actor.role !== "TERRITORY_COORDINATOR") {
    throw errors.forbidden();
  }
  const row = await prisma.trainingAttendance.update({
    where: { id: attendanceId },
    data: { followUpNote: note },
  });
  return row;
}
