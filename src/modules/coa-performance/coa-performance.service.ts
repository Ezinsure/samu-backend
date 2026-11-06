import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import {
  getSignedObjectUrl,
  uploadCoaEvidenceFile,
} from "../../lib/storage.js";
import type { AuthUser } from "../../types/express.js";
import { listMetrics } from "../coa-metrics/coa-metrics.service.js";
import {
  CLIENT_FIELD_REQUIREMENTS,
  type CreatePerformanceEntryInput,
} from "./coa-performance.schemas.js";

const ALLOWED_EVIDENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

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

async function progressForCoa(
  coaUserId: string,
  period: string,
  metrics: Awaited<ReturnType<typeof listMetrics>>,
) {
  const enabled = metrics.filter((m) => m.enabled);
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

  const { start, end } = monthBounds(period);
  const iremboCount = await prisma.agent.count({
    where: {
      recruitedByUserId: coaUserId,
      createdAt: { gte: start, lt: end },
    },
  });

  return enabled.map((metric) => {
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
      met: actual >= metric.monthlyTarget,
    };
  });
}

export async function getMyProgress(viewer: AuthUser, month?: string) {
  if (!canActAsCoa(viewer.role)) throw errors.forbidden();

  const period =
    month && /^\d{4}-\d{2}$/.test(month) ? month : currentUtcMonth();
  const metrics = await listMetrics(viewer, { includeDisabled: false });
  const rows = await progressForCoa(viewer.id, period, metrics);
  return { month: period, rows };
}

function assertAdmin(viewer: AuthUser) {
  if (viewer.role !== "ADMIN") throw errors.forbidden();
}

/** Admin national board: every active COA vs shared enabled metrics for a month. */
export async function getAdminMonthReport(viewer: AuthUser, month?: string) {
  assertAdmin(viewer);
  const period =
    month && /^\d{4}-\d{2}$/.test(month) ? month : currentUtcMonth();
  const metrics = await listMetrics(viewer, { includeDisabled: false });
  const enabled = metrics.filter((m) => m.enabled);

  const coas = await prisma.user.findMany({
    where: { role: "COMMUNITY_OPPORTUNITY_ASSOCIATE", status: "active" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      workingDistrict: true,
    },
    orderBy: { name: "asc" },
  });

  const rows = [];
  for (const coa of coas) {
    const progress = await progressForCoa(coa.id, period, metrics);
    const metricsMet = progress.filter((p) => p.met).length;
    const overallPercent =
      progress.length === 0
        ? 0
        : Math.round(
            progress.reduce((sum, p) => sum + p.percent, 0) / progress.length,
          );
    rows.push({
      coa: {
        id: coa.id,
        name: coa.name,
        email: coa.email,
        phone: coa.phone ?? undefined,
        workingDistrict: coa.workingDistrict ?? undefined,
      },
      progress,
      metricsMet,
      metricsTotal: progress.length,
      overallPercent,
    });
  }

  return {
    month: period,
    metrics: enabled,
    rows,
    totals: {
      coaCount: rows.length,
      averageOverallPercent:
        rows.length === 0
          ? 0
          : Math.round(
              rows.reduce((s, r) => s + r.overallPercent, 0) / rows.length,
            ),
    },
  };
}

export function adminReportToCsv(
  report: Awaited<ReturnType<typeof getAdminMonthReport>>,
): string {
  const metricKeys = report.metrics.map((m) => m.key);
  const header = [
    "coaName",
    "email",
    "workingDistrict",
    "metricsMet",
    "metricsTotal",
    "overallPercent",
    ...metricKeys.flatMap((key) => [`${key}_actual`, `${key}_target`]),
  ].join(",");

  const escape = (value: string | number | undefined) => {
    const raw = value == null ? "" : String(value);
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  };

  const lines = report.rows.map((row) => {
    const byKey = new Map(row.progress.map((p) => [p.metric.key, p]));
    const metricCols = metricKeys.flatMap((key) => {
      const p = byKey.get(key);
      return [p?.actual ?? 0, p?.target ?? 0];
    });
    return [
      escape(row.coa.name),
      escape(row.coa.email),
      escape(row.coa.workingDistrict),
      row.metricsMet,
      row.metricsTotal,
      row.overallPercent,
      ...metricCols,
    ].join(",");
  });

  return `${header}\n${lines.join("\n")}\n`;
}

/** Admin drill-down: one COA's progress + evidence entries for the month. */
export async function getAdminCoaDetail(
  viewer: AuthUser,
  coaUserId: string,
  month?: string,
) {
  assertAdmin(viewer);
  const period =
    month && /^\d{4}-\d{2}$/.test(month) ? month : currentUtcMonth();

  const coa = await prisma.user.findFirst({
    where: {
      id: coaUserId,
      role: "COMMUNITY_OPPORTUNITY_ASSOCIATE",
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      workingDistrict: true,
      workingProvince: true,
    },
  });
  if (!coa) throw errors.notFound("COA not found");

  const metrics = await listMetrics(viewer, { includeDisabled: false });
  const progress = await progressForCoa(coa.id, period, metrics);

  const entryRows = await prisma.coaPerformanceEntry.findMany({
    where: { coaUserId: coa.id, month: period },
    include: {
      metric: {
        select: { key: true, label: true, evidenceType: true },
      },
      clientRows: { orderBy: { createdAt: "desc" } },
      files: { orderBy: { createdAt: "desc" } },
      _count: { select: { clientRows: true, files: true } },
    },
    orderBy: { loggedAt: "desc" },
    take: 200,
  });

  return {
    month: period,
    coa: {
      id: coa.id,
      name: coa.name,
      email: coa.email,
      phone: coa.phone ?? undefined,
      workingDistrict: coa.workingDistrict ?? undefined,
      workingProvince: coa.workingProvince ?? undefined,
    },
    progress,
    entries: entryRows.map(toPublicEntry),
  };
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
    throw errors.badRequest(
      "Use the evidence file upload endpoint for this metric",
    );
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

export async function attachEvidenceFile(
  input: {
    metricKey: string;
    month: string;
    notes?: string;
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    };
  },
  actor: AuthUser,
) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const metric = await prisma.coaMetric.findUnique({
    where: { key: input.metricKey },
  });
  if (!metric || !metric.enabled) {
    throw errors.badRequest("Metric is unavailable");
  }
  if (metric.evidenceType !== "file_upload") {
    throw errors.badRequest("This metric does not accept file evidence");
  }
  if (!ALLOWED_EVIDENCE_TYPES.has(input.file.mimetype)) {
    throw errors.badRequest("Only PDF or image files (JPEG, PNG, WebP) are allowed");
  }
  if (input.file.size > MAX_EVIDENCE_BYTES) {
    throw errors.badRequest("File must be ≤ 10 MB");
  }

  const uploaded = await uploadCoaEvidenceFile({
    uploaderUserId: actor.id,
    fileName: input.file.originalname || "evidence.pdf",
    contentType: input.file.mimetype,
    body: input.file.buffer,
  });

  const entry = await prisma.coaPerformanceEntry.create({
    data: {
      metricId: metric.id,
      coaUserId: actor.id,
      month: input.month,
      notes: input.notes?.trim() || null,
      files: {
        create: {
          storageKey: uploaded.storageKey,
          originalName: input.file.originalname || "evidence.pdf",
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
        },
      },
    },
    include: {
      metric: {
        select: { key: true, label: true, evidenceType: true },
      },
      clientRows: true,
      files: { orderBy: { createdAt: "desc" } },
      _count: { select: { clientRows: true, files: true } },
    },
  });

  return toPublicEntry(entry);
}

export async function getEvidenceFileViewUrl(fileId: string, actor: AuthUser) {
  const file = await prisma.coaEvidenceFile.findUnique({
    where: { id: fileId },
    include: { entry: true },
  });
  if (!file) throw errors.notFound("File not found");

  const isNational =
    actor.role === "ADMIN" ||
    actor.role === "OPERATIONS_MANAGER" ||
    actor.role === "MD_VIEWER";
  const isOwner =
    canActAsCoa(actor.role) && file.entry.coaUserId === actor.id;
  if (!isNational && !isOwner) throw errors.forbidden();

  const url = await getSignedObjectUrl(file.storageKey, 900, {
    fileName: file.originalName,
    contentType: file.contentType,
    disposition: "inline",
  });
  return {
    id: file.id,
    url,
    originalName: file.originalName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    expiresInSeconds: 900,
  };
}

export async function deleteEvidenceFile(fileId: string, actor: AuthUser) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const file = await prisma.coaEvidenceFile.findUnique({
    where: { id: fileId },
    include: { entry: true },
  });
  if (!file) throw errors.notFound("File not found");
  if (file.entry.coaUserId !== actor.id && actor.role !== "ADMIN") {
    throw errors.forbidden();
  }

  const entryId = file.entryId;
  await prisma.coaEvidenceFile.delete({ where: { id: fileId } });

  const remaining = await prisma.coaEvidenceFile.count({ where: { entryId } });
  const clients = await prisma.coaEvidenceClient.count({ where: { entryId } });
  if (remaining === 0 && clients === 0) {
    await prisma.coaPerformanceEntry.delete({ where: { id: entryId } });
  }

  return { deleted: true };
}
