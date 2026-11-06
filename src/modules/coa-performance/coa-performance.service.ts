import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import type { AuthUser } from "../../types/express.js";
import { listMetrics } from "../coa-metrics/coa-metrics.service.js";

function canReadPerformance(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "COMMUNITY_OPPORTUNITY_ASSOCIATE" ||
    role === "OPERATIONS_MANAGER" ||
    role === "MD_VIEWER"
  );
}

function currentUtcMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthBounds(month: string): { start: Date; end: Date } {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

/**
 * Phase 1 skeleton: catalog + zeroed progress placeholders.
 * Entry logging and auto Irembo counts land in later phases.
 */
export async function getMyProgress(viewer: AuthUser, month?: string) {
  if (!canReadPerformance(viewer.role)) throw errors.forbidden();
  if (
    viewer.role !== "COMMUNITY_OPPORTUNITY_ASSOCIATE" &&
    viewer.role !== "ADMIN"
  ) {
    throw errors.forbidden();
  }

  const period = month && /^\d{4}-\d{2}$/.test(month) ? month : currentUtcMonth();
  const metrics = await listMetrics(viewer, {
    includeDisabled: viewer.role === "ADMIN",
  });
  const enabled = metrics.filter((m) => m.enabled || viewer.role === "ADMIN");

  const coaUserId = viewer.id;
  const entries = await prisma.coaPerformanceEntry.findMany({
    where: { coaUserId, month: period },
    include: {
      _count: { select: { clientRows: true, files: true } },
    },
  });

  const byMetric = new Map(entries.map((e) => [e.metricId, e]));

  // Auto Irembo: candidates recruited by this user in the month.
  const iremboMetric = enabled.find((m) => m.key === "irembo_agents_applied");
  let iremboCount = 0;
  if (iremboMetric) {
    const { start, end } = monthBounds(period);
    iremboCount = await prisma.agent.count({
      where: {
        recruitedByUserId: coaUserId,
        createdAt: { gte: start, lt: end },
      },
    });
  }

  const rows = enabled.map((metric) => {
    const entry = byMetric.get(metric.id);
    let actual = 0;
    if (metric.evidenceType === "auto_irembo") {
      actual = iremboCount;
    } else if (metric.evidenceType === "client_rows") {
      actual = entry?._count.clientRows ?? 0;
    } else if (metric.evidenceType === "file_upload") {
      actual = entry?._count.files ?? 0;
    }

    return {
      metric,
      actual,
      target: metric.monthlyTarget,
      remaining: Math.max(0, metric.monthlyTarget - actual),
      percent:
        metric.monthlyTarget > 0
          ? Math.min(100, Math.round((actual / metric.monthlyTarget) * 100))
          : 0,
    };
  });

  return { month: period, rows };
}
