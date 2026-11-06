import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import type { AuthUser } from "../../types/express.js";
import { listMetrics } from "../coa-metrics/coa-metrics.service.js";
import {
  CLIENT_FIELD_REQUIREMENTS,
  type CreatePerformanceEntryInput,
} from "./coa-performance.schemas.js";

function canActAsCoa(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" || role === "COMMUNITY_OPPORTUNITY_ASSOCIATE"
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

function blankToNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function getMyProgress(viewer: AuthUser, month?: string) {
  if (!canActAsCoa(viewer.role)) throw errors.forbidden();

  const period =
    month && /^\d{4}-\d{2}$/.test(month) ? month : currentUtcMonth();
  const metrics = await listMetrics(viewer, { includeDisabled: false });
  const enabled = metrics.filter((m) => m.enabled);

  const coaUserId = viewer.id;
  const entries = await prisma.coaPerformanceEntry.findMany({
    where: { coaUserId, month: period },
    include: {
      _count: { select: { clientRows: true, files: true } },
    },
  });

  const totalsByMetric = new Map<
    string,
    { clients: number; files: number }
  >();
  for (const entry of entries) {
    const prev = totalsByMetric.get(entry.metricId) ?? {
      clients: 0,
      files: 0,
    };
    totalsByMetric.set(entry.metricId, {
      clients: prev.clients + entry._count.clientRows,
      files: prev.files + entry._count.files,
    });
  }

  let iremboCount = 0;
  const { start, end } = monthBounds(period);
  iremboCount = await prisma.agent.count({
    where: {
      recruitedByUserId: coaUserId,
      createdAt: { gte: start, lt: end },
    },
  });

  const rows = enabled.map((metric) => {
    const totals = totalsByMetric.get(metric.id) ?? {
      clients: 0,
      files: 0,
    };
    let actual = 0;
    if (metric.evidenceType === "auto_irembo") {
      actual = iremboCount;
    } else if (metric.evidenceType === "client_rows") {
      actual = totals.clients;
    } else if (metric.evidenceType === "file_upload") {
      actual = totals.files;
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

function toPublicEntry(entry: {
  id: string;
  metricId: string;
  coaUserId: string;
  month: string;
  notes: string | null;
  loggedAt: Date;
  createdAt: Date;
  metric?: { key: string; label: string; evidenceType: string };
  clientRows?: Array<{
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    nidNumber: string | null;
    accountRef: string | null;
    simNumber: string | null;
    createdAt: Date;
  }>;
  files?: Array<{
    id: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    createdAt: Date;
  }>;
  _count?: { clientRows: number; files: number };
}) {
  return {
    id: entry.id,
    metricId: entry.metricId,
    metricKey: entry.metric?.key,
    metricLabel: entry.metric?.label,
    evidenceType: entry.metric?.evidenceType,
    month: entry.month,
    notes: entry.notes ?? undefined,
    loggedAt: entry.loggedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    clients: (entry.clientRows ?? []).map((c) => ({
      id: c.id,
      fullName: c.fullName,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      nidNumber: c.nidNumber ?? undefined,
      accountRef: c.accountRef ?? undefined,
      simNumber: c.simNumber ?? undefined,
      createdAt: c.createdAt.toISOString(),
    })),
    files: (entry.files ?? []).map((f) => ({
      id: f.id,
      originalName: f.originalName,
      contentType: f.contentType,
      sizeBytes: f.sizeBytes,
      createdAt: f.createdAt.toISOString(),
    })),
    clientCount: entry._count?.clientRows ?? entry.clientRows?.length ?? 0,
    fileCount: entry._count?.files ?? entry.files?.length ?? 0,
  };
}

export async function listMyEntries(
  viewer: AuthUser,
  opts: { month?: string; metricKey?: string } = {},
) {
  if (!canActAsCoa(viewer.role)) throw errors.forbidden();
  const month =
    opts.month && /^\d{4}-\d{2}$/.test(opts.month)
      ? opts.month
      : currentUtcMonth();

  const metric = opts.metricKey
    ? await prisma.coaMetric.findUnique({ where: { key: opts.metricKey } })
    : null;
  if (opts.metricKey && !metric) throw errors.notFound("Metric not found");

  const rows = await prisma.coaPerformanceEntry.findMany({
    where: {
      coaUserId: viewer.id,
      month,
      ...(metric ? { metricId: metric.id } : {}),
    },
    include: {
      metric: {
        select: { key: true, label: true, evidenceType: true },
      },
      clientRows: { orderBy: { createdAt: "desc" } },
      files: { orderBy: { createdAt: "desc" } },
      _count: { select: { clientRows: true, files: true } },
    },
    orderBy: { loggedAt: "desc" },
    take: 100,
  });

  return { month, data: rows.map(toPublicEntry) };
}

export async function createEntry(
  input: CreatePerformanceEntryInput,
  actor: AuthUser,
) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const metric = await prisma.coaMetric.findUnique({
    where: { key: input.metricKey },
  });
  if (!metric || !metric.enabled) {
    throw errors.badRequest("Metric is unavailable");
  }

  if (metric.evidenceType === "auto_irembo") {
    throw errors.badRequest(
      "Irembo applications are counted automatically from your recruits",
    );
  }

  if (metric.evidenceType === "file_upload") {
    // Phase 4 adds R2 uploads; allow notes-only placeholder entry for now.
    const entry = await prisma.coaPerformanceEntry.create({
      data: {
        metricId: metric.id,
        coaUserId: actor.id,
        month: input.month,
        notes:
          input.notes?.trim() ||
          "Placeholder — attach signed documents when uploads open.",
      },
      include: {
        metric: {
          select: { key: true, label: true, evidenceType: true },
        },
        clientRows: true,
        files: true,
        _count: { select: { clientRows: true, files: true } },
      },
    });
    return toPublicEntry(entry);
  }

  // client_rows
  const clients = input.clients ?? [];
  if (clients.length === 0) {
    throw errors.badRequest("Add at least one client row");
  }

  const required = CLIENT_FIELD_REQUIREMENTS[metric.key] ?? ["phone"];
  for (const [index, client] of clients.entries()) {
    for (const field of required) {
      const value = client[field];
      if (!value || !String(value).trim()) {
        throw errors.badRequest(
          `Client ${index + 1}: ${field} is required for this metric`,
        );
      }
    }
  }

  const entry = await prisma.coaPerformanceEntry.create({
    data: {
      metricId: metric.id,
      coaUserId: actor.id,
      month: input.month,
      notes: input.notes?.trim() || null,
      clientRows: {
        create: clients.map((c) => ({
          fullName: c.fullName.trim(),
          phone: blankToNull(c.phone),
          email: blankToNull(c.email),
          nidNumber: blankToNull(c.nidNumber),
          accountRef: blankToNull(c.accountRef),
          simNumber: blankToNull(c.simNumber),
        })),
      },
    },
    include: {
      metric: {
        select: { key: true, label: true, evidenceType: true },
      },
      clientRows: { orderBy: { createdAt: "desc" } },
      files: true,
      _count: { select: { clientRows: true, files: true } },
    },
  });

  return toPublicEntry(entry);
}

export async function deleteEntry(entryId: string, actor: AuthUser) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const entry = await prisma.coaPerformanceEntry.findUnique({
    where: { id: entryId },
  });
  if (!entry) throw errors.notFound("Entry not found");
  if (entry.coaUserId !== actor.id && actor.role !== "ADMIN") {
    throw errors.forbidden();
  }

  await prisma.coaPerformanceEntry.delete({ where: { id: entryId } });
  return { deleted: true };
}

export async function deleteClientRow(clientId: string, actor: AuthUser) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const row = await prisma.coaEvidenceClient.findUnique({
    where: { id: clientId },
    include: { entry: true },
  });
  if (!row) throw errors.notFound("Client row not found");
  if (row.entry.coaUserId !== actor.id && actor.role !== "ADMIN") {
    throw errors.forbidden();
  }

  await prisma.coaEvidenceClient.delete({ where: { id: clientId } });
  return { deleted: true };
}
