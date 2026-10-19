import type {
  CommunityFeedback,
  FeedbackKind,
  FeedbackSeverity,
  FeedbackStatus,
  ServiceLine,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { FeedbackInput, FeedbackListQuery } from "./feedback.schemas.js";

export type PublicFeedback = {
  id: string;
  tcUserId: string;
  serviceLine?: ServiceLine;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  title: string;
  description: string;
  geo: { province: string; district: string; sector: string };
  leadId?: string;
  createdAt: string;
  updatedAt: string;
  resolutionNotes?: string;
  tcName?: string;
};

function canWriteCoap(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

function toPublic(row: CommunityFeedback, tcName?: string): PublicFeedback {
  return {
    id: row.id,
    tcUserId: row.tcUserId,
    serviceLine: row.serviceLine ?? undefined,
    kind: row.kind,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    geo: {
      province: row.geoProvince,
      district: row.geoDistrict,
      sector: row.geoSector,
    },
    leadId: row.leadId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolutionNotes: row.resolutionNotes ?? undefined,
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
  input: FeedbackInput,
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

async function assertOptionalLead(leadId: string | undefined): Promise<void> {
  if (!leadId) return;
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw errors.badRequest("leadId does not exist");
}

/**
 * Paginated community feedback — TC-scoped; national readers see all.
 */
export async function listFeedback(
  query: FeedbackListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicFeedback[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.CommunityFeedbackWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.serviceLine) where.serviceLine = query.serviceLine;
  if (query.kind) where.kind = query.kind;
  if (query.status) where.status = query.status;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { description: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.communityFeedback.count({ where });
  const rows = await prisma.communityFeedback.findMany({
    where,
    include: { tcUser: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
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

/** Single feedback by id (scoped). */
export async function getFeedbackById(
  id: string,
  viewer: AuthUser,
): Promise<PublicFeedback> {
  const row = await prisma.communityFeedback.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!row) {
    throw errors.notFound("Feedback not found");
  }
  assertCanView(row.tcUserId, viewer);
  return toPublic(row, row.tcUser.name);
}

/** Create community feedback (Admin / Ops / TC). */
export async function createFeedback(
  input: FeedbackInput,
  viewer: AuthUser,
): Promise<PublicFeedback> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to create feedback");
  }

  const tcUserId = await resolveTcUserId(input, viewer);
  await assertOptionalLead(input.leadId);

  const id = `fb-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = await prisma.communityFeedback.create({
    data: {
      id,
      tcUserId,
      serviceLine: input.serviceLine ?? null,
      kind: input.kind,
      severity: input.severity,
      status: input.status,
      title: input.title.trim(),
      description: input.description.trim(),
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      leadId: input.leadId ?? null,
      resolutionNotes: input.resolutionNotes?.trim() || null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info(
    { feedbackId: row.id, kind: row.kind, actorUserId: viewer.id },
    "Community feedback created",
  );

  return toPublic(row, row.tcUser.name);
}

/** Update community feedback (Admin / Ops / owning TC). */
export async function updateFeedback(
  id: string,
  input: FeedbackInput,
  viewer: AuthUser,
): Promise<PublicFeedback> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to update feedback");
  }

  const existing = await prisma.communityFeedback.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Feedback not found");
  }

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("Feedback not in your territory");
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

  await assertOptionalLead(input.leadId);

  const row = await prisma.communityFeedback.update({
    where: { id },
    data: {
      tcUserId,
      serviceLine: input.serviceLine ?? null,
      kind: input.kind,
      severity: input.severity,
      status: input.status,
      title: input.title.trim(),
      description: input.description.trim(),
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      leadId: input.leadId ?? null,
      resolutionNotes: input.resolutionNotes?.trim() || null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ feedbackId: id, actorUserId: viewer.id }, "Community feedback updated");
  return toPublic(row, row.tcUser.name);
}
