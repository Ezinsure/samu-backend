import type {
  OnboardingCase,
  OnboardingKind,
  OnboardingStatus,
  ServiceLine,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type {
  OnboardingInput,
  OnboardingListQuery,
} from "./onboarding.schemas.js";

export type PublicOnboarding = {
  id: string;
  tcUserId: string;
  serviceLine: ServiceLine;
  kind: OnboardingKind;
  status: OnboardingStatus;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  agentId?: string;
  geo: { province: string; district: string; sector: string };
  stageLabel: string;
  notes?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  tcName?: string;
};

function canWriteCoap(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

function toPublic(row: OnboardingCase, tcName?: string): PublicOnboarding {
  return {
    id: row.id,
    tcUserId: row.tcUserId,
    serviceLine: row.serviceLine,
    kind: row.kind,
    status: row.status,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    leadId: row.leadId ?? undefined,
    agentId: row.agentId ?? undefined,
    geo: {
      province: row.geoProvince,
      district: row.geoDistrict,
      sector: row.geoSector,
    },
    stageLabel: row.stageLabel,
    notes: row.notes ?? undefined,
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
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
  input: OnboardingInput,
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
 * Paginated onboarding cases — TC-scoped; national readers see all.
 */
export async function listOnboarding(
  query: OnboardingListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicOnboarding[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.OnboardingCaseWhereInput = {};

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
      { customerName: { contains: query.search, mode: "insensitive" } },
      { customerPhone: { contains: query.search, mode: "insensitive" } },
      { stageLabel: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.onboardingCase.count({ where });
  const rows = await prisma.onboardingCase.findMany({
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

/** Single onboarding case by id (scoped). */
export async function getOnboardingById(
  id: string,
  viewer: AuthUser,
): Promise<PublicOnboarding> {
  const row = await prisma.onboardingCase.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!row) {
    throw errors.notFound("Onboarding case not found");
  }
  assertCanView(row.tcUserId, viewer);
  return toPublic(row, row.tcUser.name);
}

/** Create onboarding case (Admin / Ops / TC). */
export async function createOnboarding(
  input: OnboardingInput,
  viewer: AuthUser,
): Promise<PublicOnboarding> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to create onboarding");
  }

  const tcUserId = await resolveTcUserId(input, viewer);
  await assertOptionalRefs(input.leadId, input.agentId);

  const now = new Date();
  const id = `ob-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const row = await prisma.onboardingCase.create({
    data: {
      id,
      tcUserId,
      serviceLine: input.serviceLine,
      kind: input.kind,
      status: input.status,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      leadId: input.leadId ?? null,
      agentId: input.agentId ?? null,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      stageLabel: input.stageLabel.trim(),
      notes: input.notes?.trim() || null,
      startedAt: now,
      completedAt: input.status === "completed" ? now : null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info(
    { caseId: row.id, kind: row.kind, actorUserId: viewer.id },
    "Onboarding case created",
  );

  return toPublic(row, row.tcUser.name);
}

/** Update onboarding case (Admin / Ops / owning TC). */
export async function updateOnboarding(
  id: string,
  input: OnboardingInput,
  viewer: AuthUser,
): Promise<PublicOnboarding> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to update onboarding");
  }

  const existing = await prisma.onboardingCase.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Onboarding case not found");
  }

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("Case not in your territory");
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

  const now = new Date();
  let completedAt = existing.completedAt;
  if (input.status === "completed" && !completedAt) {
    completedAt = now;
  }

  const row = await prisma.onboardingCase.update({
    where: { id },
    data: {
      tcUserId,
      serviceLine: input.serviceLine,
      kind: input.kind,
      status: input.status,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      leadId: input.leadId ?? null,
      agentId: input.agentId ?? null,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      stageLabel: input.stageLabel.trim(),
      notes: input.notes?.trim() || null,
      completedAt,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ caseId: id, actorUserId: viewer.id }, "Onboarding case updated");
  return toPublic(row, row.tcUser.name);
}
