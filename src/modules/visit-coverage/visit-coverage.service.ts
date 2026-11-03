import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

function quarterRange(ref = new Date()) {
  const q = Math.floor(ref.getUTCMonth() / 3);
  const startMonth = q * 3;
  const start = new Date(Date.UTC(ref.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), startMonth + 3, 0, 23, 59, 59));
  return { start, end, label: `${ref.getUTCFullYear()}-Q${q + 1}` };
}

export async function getVisitCoverage(actor: AuthUser) {
  const { start, end, label } = quarterRange();

  const tcFilter =
    actor.role === "TERRITORY_COORDINATOR" ? { tcUserId: actor.id } : {};

  const agents = await prisma.agent.findMany({
    where: {
      ...tcFilter,
      status: { not: "Inactive" },
      tcUserId: actor.role === "TERRITORY_COORDINATOR" ? actor.id : { not: null },
    },
    select: {
      id: true,
      code: true,
      name: true,
      tcUserId: true,
      lastVisitAt: true,
      tcUser: { select: { name: true } },
    },
  });

  const visits = await prisma.visit.findMany({
    where: {
      startedAt: { gte: start, lte: end },
      ...(actor.role === "TERRITORY_COORDINATOR"
        ? { tcUserId: actor.id }
        : {}),
    },
    select: { agentId: true, tcUserId: true },
  });

  const visitedIds = new Set(visits.map((v) => v.agentId));
  const total = agents.length;
  const visited = agents.filter((a) => visitedIds.has(a.id)).length;
  const coveragePct = total === 0 ? 0 : Math.round((visited / total) * 1000) / 10;
  const targetPct = 30;

  const byTc = new Map<
    string,
    { tcUserId: string; tcName: string; total: number; visited: number }
  >();

  for (const a of agents) {
    if (!a.tcUserId) continue;
    const entry = byTc.get(a.tcUserId) ?? {
      tcUserId: a.tcUserId,
      tcName: a.tcUser?.name ?? "Unknown",
      total: 0,
      visited: 0,
    };
    entry.total += 1;
    if (visitedIds.has(a.id)) entry.visited += 1;
    byTc.set(a.tcUserId, entry);
  }

  return {
    quarter: label,
    targetPct,
    coveragePct,
    total,
    visited,
    notVisited: total - visited,
    meetsTarget: coveragePct >= targetPct,
    notVisitedAgents: agents
      .filter((a) => !visitedIds.has(a.id))
      .map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        lastVisitAt: a.lastVisitAt?.toISOString(),
        tcName: a.tcUser?.name,
      })),
    byTc: [...byTc.values()].map((r) => ({
      ...r,
      coveragePct:
        r.total === 0 ? 0 : Math.round((r.visited / r.total) * 1000) / 10,
    })),
  };
}
