import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import {
  getSignedObjectUrl,
  uploadCoaEvidenceFile,
  uploadObject,
} from "../../lib/storage.js";
import type { AuthUser } from "../../types/express.js";
import { listMetrics } from "../coa-metrics/coa-metrics.service.js";
import {
  getVariant,
  normalizeClientForVariant,
  type NormalizedClientRow,
} from "../coa-metrics/coa-metric-variants.service.js";
import {
  assertUnitSetMatchesVariant,
  consumeUnits,
  restoreUnitsForRef,
} from "../stock/stock-sales.service.js";
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
    variantKey?: string | null;
    data?: Prisma.JsonValue | null;
    gpsLat?: number | null;
    gpsLng?: number | null;
    gpsPhotoKey?: string | null;
    stockUnitIds?: string[];
    customerReturnedAt?: Date | null;
    customerReturnReason?: string | null;
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
      variantKey: c.variantKey ?? undefined,
      data:
        c.data && typeof c.data === "object" && !Array.isArray(c.data)
          ? (c.data as Record<string, unknown>)
          : undefined,
      gpsLat: c.gpsLat ?? undefined,
      gpsLng: c.gpsLng ?? undefined,
      gpsPhotoKey: c.gpsPhotoKey ?? undefined,
      stockUnitIds: c.stockUnitIds ?? [],
      customerReturnedAt: c.customerReturnedAt?.toISOString(),
      customerReturnReason: c.customerReturnReason ?? undefined,
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

function isYearMonth(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

export async function listMyEntries(
  viewer: AuthUser,
  opts: {
    month?: string;
    monthFrom?: string;
    monthTo?: string;
    metricKey?: string;
  } = {},
) {
  if (!canActAsCoa(viewer.role)) throw errors.forbidden();

  const hasRange = isYearMonth(opts.monthFrom) || isYearMonth(opts.monthTo);
  const month = isYearMonth(opts.month) ? opts.month : currentUtcMonth();
  const monthFrom = isYearMonth(opts.monthFrom)
    ? opts.monthFrom
    : hasRange
      ? month
      : undefined;
  const monthTo = isYearMonth(opts.monthTo)
    ? opts.monthTo
    : hasRange
      ? month
      : undefined;

  if (monthFrom && monthTo && monthFrom > monthTo) {
    throw errors.badRequest("monthFrom must be on or before monthTo");
  }

  const metric = opts.metricKey
    ? await prisma.coaMetric.findUnique({ where: { key: opts.metricKey } })
    : null;
  if (opts.metricKey && !metric) throw errors.notFound("Metric not found");

  const monthFilter =
    monthFrom && monthTo
      ? { gte: monthFrom, lte: monthTo }
      : month;

  const rows = await prisma.coaPerformanceEntry.findMany({
    where: {
      coaUserId: viewer.id,
      month: monthFilter,
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
    orderBy: [{ month: "desc" }, { loggedAt: "desc" }],
    take: monthFrom && monthTo ? 400 : 100,
  });

  return {
    month,
    monthFrom: monthFrom ?? month,
    monthTo: monthTo ?? month,
    data: rows.map(toPublicEntry),
  };
}

export async function createEntry(
  input: CreatePerformanceEntryInput,
  actor: AuthUser,
) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const metric = await prisma.coaMetric.findUnique({
    where: { key: input.metricKey },
    include: {
      variants: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
      },
    },
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

  const hasVariants = metric.variants.length > 0;
  const resolvedVariantKey =
    input.variantKey?.trim() ||
    clients.find((c) => c.variantKey)?.variantKey?.trim() ||
    (hasVariants ? metric.variants[0]?.key : undefined);

  if (hasVariants && !resolvedVariantKey) {
    throw errors.badRequest("Choose an internet type (SIM, HBB, or OBB)");
  }

  let normalized: NormalizedClientRow[] = [];

  if (hasVariants && resolvedVariantKey) {
    const variant = await getVariant(metric.key, resolvedVariantKey);
    normalized = clients.map((client, index) =>
      normalizeClientForVariant(
        {
          ...client,
          fullName: client.fullName,
          data: client.data,
          gpsLat: client.gpsLat,
          gpsLng: client.gpsLng,
          gpsPhotoKey: client.gpsPhotoKey,
        },
        variant.fieldSchema,
        variant.key,
        index,
      ),
    );
  } else {
    const required = CLIENT_FIELD_REQUIREMENTS[metric.key] ?? ["phone"];
    for (const [index, client] of clients.entries()) {
      if (!client.fullName?.trim()) {
        throw errors.badRequest(`Client ${index + 1}: name is required`);
      }
      for (const field of required) {
        const value = client[field];
        if (!value || !String(value).trim()) {
          throw errors.badRequest(
            `Client ${index + 1}: ${field} is required for this metric`,
          );
        }
      }
    }
    normalized = clients.map((c) => ({
      fullName: c.fullName!.trim(),
      phone: blankToNull(c.phone),
      email: blankToNull(c.email),
      nidNumber: blankToNull(c.nidNumber),
      accountRef: blankToNull(c.accountRef),
      simNumber: blankToNull(c.simNumber),
      variantKey: null,
      data: null,
      gpsLat: null,
      gpsLng: null,
      gpsPhotoKey: null,
      stockUnitIds: c.stockUnitIds ?? [],
    }));
  }

  // Internet variants require serials from the logger's in-hand stock.
  if (metric.key === "internet_subscriptions" && resolvedVariantKey) {
    for (const [index, client] of normalized.entries()) {
      if (!client.stockUnitIds.length) {
        throw errors.badRequest(
          `Client ${index + 1}: pick device serial(s) from your stock`,
        );
      }
    }
  }

  const entryId = await prisma.$transaction(async (tx) => {
    const created = await tx.coaPerformanceEntry.create({
      data: {
        metricId: metric.id,
        coaUserId: actor.id,
        month: input.month,
        notes: input.notes?.trim() || null,
      },
    });

    for (const client of normalized) {
      const row = await tx.coaEvidenceClient.create({
        data: {
          entryId: created.id,
          fullName: client.fullName,
          phone: client.phone,
          email: client.email,
          nidNumber: client.nidNumber,
          accountRef: client.accountRef,
          simNumber: client.simNumber,
          variantKey: client.variantKey,
          data: (client.data ?? undefined) as Prisma.InputJsonValue | undefined,
          gpsLat: client.gpsLat,
          gpsLng: client.gpsLng,
          gpsPhotoKey: client.gpsPhotoKey,
          stockUnitIds: client.stockUnitIds,
        },
      });

      if (
        metric.key === "internet_subscriptions" &&
        resolvedVariantKey &&
        client.stockUnitIds.length > 0
      ) {
        const units = await tx.stockUnit.findMany({
          where: { id: { in: client.stockUnitIds } },
          include: { type: true },
        });
        assertUnitSetMatchesVariant(units, resolvedVariantKey);
        // Fill serial fields from stock when picker ids are provided.
        const sim = units.find((u) => u.type.key === "sim_4g");
        const router = units.find((u) => u.type.key.startsWith("router_"));
        await tx.coaEvidenceClient.update({
          where: { id: row.id },
          data: {
            simNumber: sim?.serial ?? row.simNumber,
            data: {
              ...((client.data as Record<string, unknown> | null) ?? {}),
              ...(router ? { routerSerial: router.serial } : {}),
              ...(sim && resolvedVariantKey !== "sim"
                ? { fourGNumber: sim.serial }
                : {}),
            } as Prisma.InputJsonValue,
          },
        });
        await consumeUnits(tx, {
          unitIds: client.stockUnitIds,
          actor,
          refType: "coa_evidence_client",
          refId: row.id,
          requiredHolderId: actor.id,
          note: `${metric.label} · ${resolvedVariantKey}`,
        });
      }
    }

    return created.id;
  });

  const entry = await prisma.coaPerformanceEntry.findUniqueOrThrow({
    where: { id: entryId },
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

/** Upload a GPS map screenshot used by HBB/OBB logging. */
export async function uploadGpsPhoto(
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  },
  actor: AuthUser,
) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();
  if (!ALLOWED_EVIDENCE_TYPES.has(file.mimetype)) {
    throw errors.badRequest("Only JPEG, PNG, or WebP images are allowed");
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    throw errors.badRequest("File must be 10 MB or smaller");
  }

  const uploaded = await uploadObject({
    prefix: "coa-gps",
    uploaderUserId: actor.id,
    fileName: file.originalname || "gps.jpg",
    contentType: file.mimetype,
    body: file.buffer,
  });

  return {
    storageKey: uploaded.storageKey,
    contentType: uploaded.contentType,
    sizeBytes: uploaded.sizeBytes,
  };
}

/** Short-lived URL for a GPS photo stored on a client row. */
export async function getGpsPhotoViewUrl(clientId: string, actor: AuthUser) {
  if (!canActAsCoa(actor.role) && actor.role !== "OPERATIONS_MANAGER" && actor.role !== "MD_VIEWER") {
    throw errors.forbidden();
  }

  const client = await prisma.coaEvidenceClient.findUnique({
    where: { id: clientId },
    include: {
      entry: { select: { coaUserId: true } },
    },
  });
  if (!client?.gpsPhotoKey) throw errors.notFound("GPS photo not found");

  if (
    actor.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE" &&
    client.entry.coaUserId !== actor.id
  ) {
    throw errors.forbidden();
  }

  const url = await getSignedObjectUrl(client.gpsPhotoKey, 15 * 60);
  return { id: client.id, url, storageKey: client.gpsPhotoKey };
}

export async function deleteEntry(entryId: string, actor: AuthUser) {
  if (!canActAsCoa(actor.role)) throw errors.forbidden();

  const entry = await prisma.coaPerformanceEntry.findUnique({
    where: { id: entryId },
    include: { clientRows: { select: { id: true } } },
  });
  if (!entry) throw errors.notFound("Entry not found");
  if (entry.coaUserId !== actor.id && actor.role !== "ADMIN") {
    throw errors.forbidden();
  }

  await prisma.$transaction(async (tx) => {
    for (const client of entry.clientRows) {
      await restoreUnitsForRef(tx, {
        refType: "coa_evidence_client",
        refId: client.id,
        actor,
        note: "Stock restored after performance entry delete",
      });
    }
    await tx.coaPerformanceEntry.delete({ where: { id: entryId } });
  });
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

  await prisma.$transaction(async (tx) => {
    await restoreUnitsForRef(tx, {
      refType: "coa_evidence_client",
      refId: row.id,
      actor,
      note: "Stock restored after client row delete",
    });
    await tx.coaEvidenceClient.delete({ where: { id: clientId } });
  });
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
