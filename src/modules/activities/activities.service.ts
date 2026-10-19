import type {
  FieldActivity,
  FieldActivityType,
  ServiceLine,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { ActivityInput, ActivityListQuery } from "./activities.schemas.js";

export type PublicActivity = {
  id: string;
  tcUserId: string;
  serviceLine: ServiceLine;
  activityType: FieldActivityType;
  date: string;
  geo: { province: string; district: string; sector: string };
  venue: string;
  peopleReached: number;
  summary: string;
  outcome: string;
  leadId?: string;
  agentId?: string;
  createdAt: string;
  tcName?: string;
};

function canWriteCoap(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

/** Format Prisma DATE as YYYY-MM-DD (UTC date parts). */
function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Parse YYYY-MM-DD into a UTC midnight Date for @db.Date columns. */
function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toPublic(row: FieldActivity, tcName?: string): PublicActivity {
  return {
    id: row.id,
    tcUserId: row.tcUserId,
    serviceLine: row.serviceLine,
    activityType: row.activityType,
    date: formatDateOnly(row.date),
    geo: {
      province: row.geoProvince,
      district: row.geoDistrict,
      sector: row.geoSector,
    },
    venue: row.venue,
    peopleReached: row.peopleReached,
    summary: row.summary,
    outcome: row.outcome,
    leadId: row.leadId ?? undefined,
    agentId: row.agentId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    tcName,
  };
}

function assertCanView(tcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && tcUserId === viewer.id) {
    return;
  }
  throw errors.forbidden();
}

async function assertActiveTc(tcUserId: string): Promise<void> {
  const tc = await prisma.user.findFirst({
    where: {
      id: tcUserId,
      role: "TERRITORY_COORDINATOR",
      status: "active",
    },
  });
  if (!tc) {
    throw errors.badRequest("Selected user is not an active territory coordinator");
  }
}

async function resolveTcUserId(
  input: ActivityInput,
  viewer: AuthUser,
): Promise<string> {
  if (viewer.role === "TERRITORY_COORDINATOR") {
    return viewer.id;
  }
  const tcUserId = input.tcUserId;
  if (!tcUserId) {
    throw errors.badRequest("tcUserId is required");
  }
  await assertActiveTc(tcUserId);
  return tcUserId;
}

async function assertOptionalRefs(
  leadId: string | undefined,
  agentId: string | undefined,
): Promise<void> {
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw errors.badRequest("leadId does not exist");
  }
  if (agentId) {
    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw errors.badRequest("agentId does not exist");
  }
}

/**
 * Paginated field activities — TC-scoped; national readers see all.
 */
export async function listActivities(
  query: ActivityListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicActivity[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.FieldActivityWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.serviceLine) where.serviceLine = query.serviceLine;
  if (query.activityType) where.activityType = query.activityType;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { venue: { contains: query.search, mode: "insensitive" } },
      { summary: { contains: query.search, mode: "insensitive" } },
      { outcome: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.fieldActivity.count({ where });
  const rows = await prisma.fieldActivity.findMany({
    where,
    include: { tcUser: { select: { name: true } } },
    orderBy: { date: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => toPublic(row, row.tcUser.name)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

/** Single activity by id (scoped). */
export async function getActivityById(
  id: string,
  viewer: AuthUser,
): Promise<PublicActivity> {
  const row = await prisma.fieldActivity.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!row) {
    throw errors.notFound("Field activity not found");
  }
  assertCanView(row.tcUserId, viewer);
  return toPublic(row, row.tcUser.name);
}

/** Create field activity (Admin / Ops / TC). */
export async function createActivity(
  input: ActivityInput,
  viewer: AuthUser,
): Promise<PublicActivity> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to create activities");
  }

  const tcUserId = await resolveTcUserId(input, viewer);
  await assertOptionalRefs(input.leadId, input.agentId);

  const id = `fact-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = await prisma.fieldActivity.create({
    data: {
      id,
      tcUserId,
      serviceLine: input.serviceLine,
      activityType: input.activityType,
      date: parseDateOnly(input.date),
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      venue: input.venue.trim(),
      peopleReached: input.peopleReached,
      summary: input.summary.trim(),
      outcome: input.outcome.trim(),
      leadId: input.leadId ?? null,
      agentId: input.agentId ?? null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info(
    {
      activityId: row.id,
      activityType: row.activityType,
      actorUserId: viewer.id,
    },
    "Field activity created",
  );

  return toPublic(row, row.tcUser.name);
}

/** Update field activity (Admin / Ops / owning TC). */
export async function updateActivity(
  id: string,
  input: ActivityInput,
  viewer: AuthUser,
): Promise<PublicActivity> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to update activities");
  }

  const existing = await prisma.fieldActivity.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Field activity not found");
  }

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("Activity not in your territory");
  }

  let tcUserId = existing.tcUserId;
  if (
    (viewer.role === "ADMIN" || viewer.role === "OPERATIONS_MANAGER") &&
    input.tcUserId &&
    input.tcUserId !== existing.tcUserId
  ) {
    await assertActiveTc(input.tcUserId);
    tcUserId = input.tcUserId;
  }

  await assertOptionalRefs(input.leadId, input.agentId);

  const row = await prisma.fieldActivity.update({
    where: { id },
    data: {
      tcUserId,
      serviceLine: input.serviceLine,
      activityType: input.activityType,
      date: parseDateOnly(input.date),
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      venue: input.venue.trim(),
      peopleReached: input.peopleReached,
      summary: input.summary.trim(),
      outcome: input.outcome.trim(),
      leadId: input.leadId ?? null,
      agentId: input.agentId ?? null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ activityId: id, actorUserId: viewer.id }, "Field activity updated");
  return toPublic(row, row.tcUser.name);
}
