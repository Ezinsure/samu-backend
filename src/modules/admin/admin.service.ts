import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import {
  ensureSettingsRow,
  getSettings,
  toPublicSettings,
  type PublicSettings,
} from "../../lib/settings.js";
import type { AuthUser } from "../../types/express.js";
import type { AuditListQuery, SettingsPatchInput } from "./admin.schemas.js";

export async function readSettings(viewer: AuthUser): Promise<PublicSettings> {
  if (viewer.role !== "ADMIN" && viewer.role !== "OPERATIONS_MANAGER") {
    throw errors.forbidden();
  }
  return getSettings();
}

export async function updateSettings(
  input: SettingsPatchInput,
  viewer: AuthUser,
  meta?: { ip?: string; userAgent?: string },
): Promise<PublicSettings> {
  if (viewer.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can update system settings");
  }

  await ensureSettingsRow();
  const current = await prisma.systemSettings.findUniqueOrThrow({
    where: { id: "default" },
  });

  const updated = await prisma.systemSettings.update({
    where: { id: "default" },
    data: {
      gpsDistanceMeters: input.gpsDistanceMeters,
      agentGreenDays: input.agentGreenDays,
      agentYellowDays: input.agentYellowDays,
      tcComplianceGreen: input.tcComplianceGreen,
      tcComplianceYellow: input.tcComplianceYellow,
      monthlyReportDueDay: input.monthlyReportDueDay,
      kpiTargetsJson: input.kpiTargets ?? undefined,
      smsTemplatesJson: input.smsTemplates ?? undefined,
      updatedByUserId: viewer.id,
    },
  });

  await writeAuditLog({
    actorUserId: viewer.id,
    action: "settings.update",
    objectType: "system_settings",
    objectId: "default",
    summary: `Settings updated (GPS ${updated.gpsDistanceMeters}m; was ${current.gpsDistanceMeters}m).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicSettings(updated);
}

export type PublicAuditLog = {
  id: string;
  actorUserId?: string;
  actorName?: string;
  action: string;
  objectType: string;
  objectId: string;
  summary: string;
  ip?: string;
  userAgent?: string;
  timestamp: string;
};

export async function listAuditLogs(
  query: AuditListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicAuditLog[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  if (viewer.role !== "ADMIN" && viewer.role !== "OPERATIONS_MANAGER") {
    throw errors.forbidden();
  }

  const where: Prisma.AuditLogWhereInput = {};
  if (query.action) where.action = query.action;
  if (query.objectType) where.objectType = query.objectType;
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  if (query.search) {
    where.OR = [
      { action: { contains: query.search, mode: "insensitive" } },
      { summary: { contains: query.search, mode: "insensitive" } },
      { objectType: { contains: query.search, mode: "insensitive" } },
      { objectId: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.auditLog.count({ where });
  const rows = await prisma.auditLog.findMany({
    where,
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId ?? undefined,
      actorName: row.actor?.name,
      action: row.action,
      objectType: row.objectType,
      objectId: row.objectId,
      summary: row.summary,
      ip: row.ip ?? undefined,
      userAgent: row.userAgent ?? undefined,
      timestamp: row.createdAt.toISOString(),
    })),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAuditFilterOptions(viewer: AuthUser) {
  if (viewer.role !== "ADMIN" && viewer.role !== "OPERATIONS_MANAGER") {
    throw errors.forbidden();
  }

  const [actions, objectTypes] = await Promise.all([
    prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
      take: 100,
    }),
    prisma.auditLog.findMany({
      select: { objectType: true },
      distinct: ["objectType"],
      orderBy: { objectType: "asc" },
      take: 50,
    }),
  ]);

  return {
    actions: actions.map((a) => a.action),
    objectTypes: objectTypes.map((o) => o.objectType),
  };
}
