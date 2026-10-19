import type { Lead, LeadEntityType, LeadStatus, ServiceLine } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { LeadInput, LeadListQuery } from "./leads.schemas.js";

export type PublicLead = {
  id: string;
  name: string;
  phone: string;
  entityType: LeadEntityType;
  serviceLine: ServiceLine;
  status: LeadStatus;
  geo: { province: string; district: string; sector: string };
  tcUserId: string;
  notes?: string;
  interestSummary?: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  tcName?: string;
};

function canWriteCoap(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

function toPublic(lead: Lead, tcName?: string): PublicLead {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    entityType: lead.entityType,
    serviceLine: lead.serviceLine,
    status: lead.status,
    geo: {
      province: lead.geoProvince,
      district: lead.geoDistrict,
      sector: lead.geoSector,
    },
    tcUserId: lead.tcUserId,
    notes: lead.notes ?? undefined,
    interestSummary: lead.interestSummary ?? undefined,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    convertedAt: lead.convertedAt?.toISOString(),
    tcName,
  };
}

function assertCanView(leadTcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && leadTcUserId === viewer.id) {
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

/**
 * Resolve owning TC: TCs always own their creates; Admin/Ops may assign.
 */
async function resolveTcUserId(
  input: LeadInput,
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

/**
 * Paginated lead list — TC-scoped; national readers see all.
 */
export async function listLeads(
  query: LeadListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicLead[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.LeadWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.serviceLine) where.serviceLine = query.serviceLine;
  if (query.status) where.status = query.status;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
      { interestSummary: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.lead.count({ where });
  const rows = await prisma.lead.findMany({
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

/** Single lead by id (scoped). */
export async function getLeadById(
  id: string,
  viewer: AuthUser,
): Promise<PublicLead> {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!lead) {
    throw errors.notFound("Lead not found");
  }
  assertCanView(lead.tcUserId, viewer);
  return toPublic(lead, lead.tcUser.name);
}

/** Create lead (Admin / Ops / TC). */
export async function createLead(
  input: LeadInput,
  viewer: AuthUser,
): Promise<PublicLead> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to create leads");
  }

  const tcUserId = await resolveTcUserId(input, viewer);
  const now = new Date();
  const id = `lead-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const lead = await prisma.lead.create({
    data: {
      id,
      name: input.name.trim(),
      phone: input.phone.trim(),
      entityType: input.entityType,
      serviceLine: input.serviceLine,
      status: input.status,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      tcUserId,
      notes: input.notes?.trim() || null,
      interestSummary: input.interestSummary?.trim() || null,
      convertedAt: input.status === "converted" ? now : null,
      createdAt: now,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info(
    { leadId: lead.id, serviceLine: lead.serviceLine, actorUserId: viewer.id },
    "Lead created",
  );

  return toPublic(lead, lead.tcUser.name);
}

/** Update lead (Admin / Ops / owning TC). */
export async function updateLead(
  id: string,
  input: LeadInput,
  viewer: AuthUser,
): Promise<PublicLead> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to update leads");
  }

  const existing = await prisma.lead.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Lead not found");
  }

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("Lead not in your territory");
  }

  // TCs cannot reassign ownership; Admin/Ops may via tcUserId.
  let tcUserId = existing.tcUserId;
  if (
    (viewer.role === "ADMIN" || viewer.role === "OPERATIONS_MANAGER") &&
    input.tcUserId &&
    input.tcUserId !== existing.tcUserId
  ) {
    await assertActiveTc(input.tcUserId);
    tcUserId = input.tcUserId;
  }

  const now = new Date();
  let convertedAt = existing.convertedAt;
  if (input.status === "converted" && !convertedAt) {
    convertedAt = now;
  }

  const lead = await prisma.lead.update({
    where: { id },
    data: {
      name: input.name.trim(),
      phone: input.phone.trim(),
      entityType: input.entityType,
      serviceLine: input.serviceLine,
      status: input.status,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      tcUserId,
      notes: input.notes?.trim() || null,
      interestSummary: input.interestSummary?.trim() || null,
      convertedAt,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ leadId: id, actorUserId: viewer.id }, "Lead updated");
  return toPublic(lead, lead.tcUser.name);
}
