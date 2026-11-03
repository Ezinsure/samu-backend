import { Prisma } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import {
  DEFAULT_AGENT_SERVICES,
  maskNidFromPhone,
  toPublicAgent,
  statusFromApi,
  type PublicAgent,
} from "./agents.mapper.js";
import type {
  AgentInput,
  AgentListQuery,
  PipelineActionInput,
} from "./agents.schemas.js";

function canManageAgents(role: AuthUser["role"]): boolean {
  return role === "ADMIN";
}

function canCreateNetworkMember(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "TERRITORY_COORDINATOR" ||
    role === "COMMUNITY_OPPORTUNITY_ASSOCIATE"
  );
}

function assertCanViewAgent(
  agent: { tcUserId: string | null; recruitedByUserId: string | null },
  viewer: AuthUser,
): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    agent.tcUserId === viewer.id
  ) {
    return;
  }
  if (
    viewer.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE" &&
    agent.recruitedByUserId === viewer.id
  ) {
    return;
  }
  // COA may browse the national list lightly for Phase 1+; restrict to own recruits for writes.
  if (viewer.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE") return;
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

async function nextAgentCode(): Promise<string> {
  const latest = await prisma.agent.findMany({
    select: { code: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  let max = 0;
  for (const row of latest) {
    const match = /(\d+)$/.exec(row.code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `AGT-NEW-${String(max + 1).padStart(3, "0")}`;
}

function profileFieldsFromInput(input: AgentInput) {
  return {
    age: input.age ?? null,
    gender: input.gender?.trim() || null,
    education: input.education?.trim() || null,
    tin: input.tin?.trim() || null,
    businessType: input.businessType?.trim() || null,
    venue: input.venue?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    criminalRecordBillId: input.criminalRecordBillId?.trim() || null,
    certificateStorageKey: input.certificateStorageKey?.trim() || null,
    hasPrinterScanner: input.hasPrinterScanner ?? false,
    hasComputer: input.hasComputer ?? false,
    officeType: input.officeType ?? null,
    building: input.building?.trim() || null,
    geoVillage: input.geo.village?.trim() || null,
    nidMasked: input.nidNumber
      ? `1********${input.nidNumber.replace(/\D/g, "").slice(-3)}`
      : maskNidFromPhone(input.phone),
  };
}

export async function getFilterOptions(viewer: AuthUser) {
  const where: Prisma.AgentWhereInput = {};
  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (viewer.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE") {
    where.recruitedByUserId = viewer.id;
  }

  const [agents, coordinators] = await Promise.all([
    prisma.agent.findMany({
      where,
      select: {
        geoProvince: true,
        geoDistrict: true,
        status: true,
      },
    }),
    prisma.user.findMany({
      where: { role: "TERRITORY_COORDINATOR", status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const provinces = [...new Set(agents.map((a) => a.geoProvince))].sort();
  const districts = [...new Set(agents.map((a) => a.geoDistrict))].sort();
  const statuses = [...new Set(agents.map((a) => a.status))].sort();

  return { provinces, districts, statuses, coordinators };
}

export async function listAgents(
  query: AgentListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicAgent[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.AgentWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (viewer.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE") {
    where.recruitedByUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.unassigned === true) where.tcUserId = null;
  if (query.province) where.geoProvince = query.province;
  if (query.district) where.geoDistrict = query.district;
  if (query.status) where.status = statusFromApi(query.status);
  if (query.compliance) where.compliance = query.compliance;
  if (query.reviewStatus) where.reviewStatus = query.reviewStatus;
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
      { phone: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
      { geoSector: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.AgentOrderByWithRelationInput =
    query.sortBy === "lastVisit"
      ? { lastVisitAt: query.sortDir }
      : query.sortBy === "status"
        ? { status: query.sortDir }
        : { name: query.sortDir };

  const total = await prisma.agent.count({ where });
  const rows = await prisma.agent.findMany({
    where,
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
    orderBy,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) =>
      toPublicAgent(row, {
        tcName: row.tcUser?.name,
        recruitedByName: row.recruitedBy?.name,
      }),
    ),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getAgentDetail(id: string, viewer: AuthUser) {
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
      assignments: {
        include: { tcUser: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
      },
      supportLogs: {
        orderBy: { supportedAt: "desc" },
        take: 10,
        include: { tcUser: { select: { name: true } } },
      },
    },
  });

  if (!agent) {
    throw errors.notFound("Agent not found");
  }
  assertCanViewAgent(agent, viewer);

  const recentVisits = await prisma.visit.findMany({
    where: { agentId: id },
    include: {
      photos: true,
      tcUser: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return {
    agent: toPublicAgent(agent, {
      tcName: agent.tcUser?.name,
      recruitedByName: agent.recruitedBy?.name,
    }),
    visits: recentVisits.map((visit) => ({
      id: visit.id,
      agentId: visit.agentId,
      tcUserId: visit.tcUserId,
      startedAt: visit.startedAt.toISOString(),
      endedAt: visit.endedAt.toISOString(),
      durationMinutes: visit.durationMinutes,
      purpose: visit.purpose,
      activities: visit.activities,
      outcome: visit.outcome,
      location: {
        lat: visit.lat,
        lng: visit.lng,
        accuracyMeters: visit.accuracyMeters ?? undefined,
      },
      distanceFromRegisteredMeters: visit.distanceFromRegisteredMeters,
      validation: visit.validation,
      confirmationStatus: visit.confirmationStatus,
      photoCount: visit.photos.length,
      challenges: visit.challenges ?? undefined,
      supportNeeded: visit.supportNeeded ?? undefined,
      flaggedReason: visit.flaggedReason ?? undefined,
      tcName: visit.tcUser.name,
    })),
    assignments: agent.assignments.map((a) => ({
      id: a.id,
      agentId: a.agentId,
      tcUserId: a.tcUserId,
      tcName: a.tcUser.name,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt?.toISOString(),
      active: a.active,
    })),
    supportLogs: agent.supportLogs.map((s) => ({
      id: s.id,
      agentId: s.agentId,
      tcUserId: s.tcUserId,
      tcName: s.tcUser.name,
      supportedAt: s.supportedAt.toISOString(),
      channel: s.channel,
      summary: s.summary,
      outcome: s.outcome ?? undefined,
    })),
    tcName: agent.tcUser?.name,
  };
}

export async function createAgent(
  input: AgentInput,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (!canCreateNetworkMember(actor.role)) {
    throw errors.forbidden();
  }

  const isCoa = actor.role === "COMMUNITY_OPPORTUNITY_ASSOCIATE";
  const isTc = actor.role === "TERRITORY_COORDINATOR";

  let tcUserId: string | null = input.tcUserId ?? null;
  if (isTc) tcUserId = actor.id;
  if (isCoa) tcUserId = null;
  if (tcUserId) await assertActiveTc(tcUserId);
  if (actor.role === "ADMIN" && !tcUserId && !isCoa) {
    // Admin may leave unassigned; OK
  }

  const code = input.code?.trim() || (await nextAgentCode());
  const existingCode = await prisma.agent.findUnique({ where: { code } });
  if (existingCode) {
    throw errors.conflict(`Agent code ${code} already exists`);
  }

  const id = `agent-${Date.now()}`;
  const now = new Date();
  const services = { ...DEFAULT_AGENT_SERVICES, ...(input.services ?? {}) };
  const profile = profileFieldsFromInput(input);

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.agent.create({
      data: {
        id,
        code,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        nidVerified: input.nidVerified ?? false,
        status: statusFromApi(input.status ?? "Candidate"),
        reviewStatus: "accepted",
        ...profile,
        geoProvince: input.geo.province,
        geoDistrict: input.geo.district,
        geoSector: input.geo.sector,
        geoCell: input.geo.cell,
        lat: input.registeredLocation.lat,
        lng: input.registeredLocation.lng,
        accuracyMeters: 5,
        tcUserId,
        recruitedByUserId: actor.id,
        servicesJson: services,
        compliance: "yellow",
        clientsRegistered: input.clientsRegistered ?? 0,
        recruitedThisMonth: input.recruitedThisMonth ?? true,
        reactivatedThisMonth: input.reactivatedThisMonth ?? false,
        createdAt: now,
      },
    }),
  ];

  if (tcUserId) {
    ops.push(
      prisma.agentAssignment.create({
        data: {
          agentId: id,
          tcUserId,
          startedAt: now,
          active: true,
        },
      }),
    );
  }

  await prisma.$transaction(ops);

  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id },
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
  });

  logger.info(
    { agentId: agent.id, code: agent.code, actorUserId: actor.id },
    "Network member created",
  );

  return toPublicAgent(agent, {
    tcName: agent.tcUser?.name,
    recruitedByName: agent.recruitedBy?.name,
  });
}

export async function updateAgent(
  id: string,
  input: AgentInput,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (!canManageAgents(actor.role) && actor.role !== "TERRITORY_COORDINATOR") {
    throw errors.forbidden();
  }

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Agent not found");
  }
  if (
    actor.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== actor.id
  ) {
    throw errors.forbidden();
  }

  const tcUserId =
    actor.role === "TERRITORY_COORDINATOR"
      ? actor.id
      : (input.tcUserId ?? existing.tcUserId);
  if (tcUserId) await assertActiveTc(tcUserId);

  const code = input.code?.trim() || existing.code;
  if (code !== existing.code) {
    const clash = await prisma.agent.findUnique({ where: { code } });
    if (clash) {
      throw errors.conflict(`Agent code ${code} already exists`);
    }
  }

  const previousTc = existing.tcUserId;
  const now = new Date();
  const services = {
    ...DEFAULT_AGENT_SERVICES,
    ...parseJsonServices(existing.servicesJson),
    ...(input.services ?? {}),
  };
  const profile = profileFieldsFromInput(input);

  const agentUpdate = prisma.agent.update({
    where: { id },
    data: {
      code,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      nidVerified: input.nidVerified ?? existing.nidVerified,
      status: statusFromApi(input.status ?? statusFromApiSafe(existing.status)),
      ...profile,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      geoCell: input.geo.cell,
      lat: input.registeredLocation.lat,
      lng: input.registeredLocation.lng,
      tcUserId,
      servicesJson: services,
      clientsRegistered: input.clientsRegistered ?? existing.clientsRegistered,
      recruitedThisMonth:
        input.recruitedThisMonth ?? existing.recruitedThisMonth,
      reactivatedThisMonth:
        input.reactivatedThisMonth ?? existing.reactivatedThisMonth,
    },
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
  });

  let agent;
  if (tcUserId && previousTc !== tcUserId) {
    const results = await prisma.$transaction([
      prisma.agentAssignment.updateMany({
        where: { agentId: id, active: true },
        data: { active: false, endedAt: now },
      }),
      prisma.agentAssignment.create({
        data: {
          agentId: id,
          tcUserId,
          startedAt: now,
          active: true,
        },
      }),
      agentUpdate,
    ]);
    agent = results[2];
  } else {
    agent = await agentUpdate;
  }

  logger.info({ agentId: id, actorUserId: actor.id }, "Network member updated");

  return toPublicAgent(agent, {
    tcName: agent.tcUser?.name,
    recruitedByName: agent.recruitedBy?.name,
  });
}

function parseJsonServices(json: Prisma.JsonValue) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return json as Record<string, unknown>;
}

function statusFromApiSafe(
  status: string,
): "Candidate" | "InTraining" | "ExamPending" | "Certified" | "Inactive" {
  if (
    status === "Candidate" ||
    status === "InTraining" ||
    status === "ExamPending" ||
    status === "Certified" ||
    status === "Inactive"
  ) {
    return status;
  }
  return "Candidate";
}

export async function applyPipelineAction(
  id: string,
  input: PipelineActionInput,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (
    actor.role !== "ADMIN" &&
    actor.role !== "TERRITORY_COORDINATOR" &&
    actor.role !== "OPERATIONS_MANAGER"
  ) {
    throw errors.forbidden();
  }

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) throw errors.notFound("Agent not found");
  if (
    actor.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== actor.id
  ) {
    throw errors.forbidden();
  }

  const data: Prisma.AgentUpdateInput = {};
  if (input.action === "start_training") {
    data.status = "InTraining";
  } else if (input.action === "record_exam") {
    if (input.examScore === undefined) {
      throw errors.badRequest("examScore is required");
    }
    data.examScore = input.examScore;
    data.status = input.examScore >= 80 ? "ExamPending" : "InTraining";
  } else if (input.action === "certify") {
    const score = input.examScore ?? existing.examScore;
    if (score === null || score === undefined || score < 80) {
      throw errors.badRequest("Exam score must be at least 80% to certify");
    }
    data.status = "Certified";
    data.examScore = score;
    if (input.iremboAccountCreated) {
      data.iremboAccountCreatedAt = new Date();
    }
  }

  const agent = await prisma.agent.update({
    where: { id },
    data,
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: `agent.pipeline.${input.action}`,
    objectType: "agent",
    objectId: id,
    summary: `Pipeline action ${input.action} on ${agent.code}`,
  });

  return toPublicAgent(agent, {
    tcName: agent.tcUser?.name,
    recruitedByName: agent.recruitedBy?.name,
  });
}

export async function reviewAgent(
  id: string,
  action: "accept" | "reject",
  actor: AuthUser,
): Promise<PublicAgent> {
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) throw errors.notFound("Agent not found");
  if (
    actor.role !== "ADMIN" &&
    existing.recruitedByUserId !== actor.id
  ) {
    throw errors.forbidden();
  }

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      reviewStatus: action === "accept" ? "accepted" : "rejected",
    },
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
  });

  return toPublicAgent(agent, {
    tcName: agent.tcUser?.name,
    recruitedByName: agent.recruitedBy?.name,
  });
}

export async function assignTerritoryCoordinator(
  id: string,
  tcUserId: string,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (actor.role !== "ADMIN") throw errors.forbidden();
  await assertActiveTc(tcUserId);

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) throw errors.notFound("Agent not found");

  const now = new Date();
  await prisma.$transaction([
    prisma.agentAssignment.updateMany({
      where: { agentId: id, active: true },
      data: { active: false, endedAt: now },
    }),
    prisma.agentAssignment.create({
      data: { agentId: id, tcUserId, startedAt: now, active: true },
    }),
    prisma.agent.update({
      where: { id },
      data: { tcUserId, reviewStatus: "accepted" },
    }),
  ]);

  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id },
    include: {
      tcUser: { select: { name: true } },
      recruitedBy: { select: { name: true } },
    },
  });

  return toPublicAgent(agent, {
    tcName: agent.tcUser?.name,
    recruitedByName: agent.recruitedBy?.name,
  });
}

export async function findAgentsForTerritory(opts: {
  type: "province" | "district" | "sector" | "cell";
  name: string;
  districtNames?: string[];
  tcUserId?: string;
}) {
  const where: Prisma.AgentWhereInput = {};
  if (opts.tcUserId) where.tcUserId = opts.tcUserId;

  if (opts.type === "province") {
    where.geoProvince = opts.name;
    if (opts.districtNames && opts.districtNames.length > 0) {
      where.geoDistrict = { in: opts.districtNames };
    }
  } else if (opts.type === "district") {
    where.geoDistrict = opts.name;
  } else if (opts.type === "sector") {
    where.geoSector = opts.name;
  } else {
    where.geoCell = opts.name;
  }

  return prisma.agent.findMany({
    where,
    include: { tcUser: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function reassignAgentsInDistrict(
  districtName: string,
  tcUserId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<number> {
  const agents = await tx.agent.findMany({
    where: { geoDistrict: districtName },
    select: { id: true },
  });
  if (agents.length === 0) return 0;

  const now = new Date();
  const ids = agents.map((a) => a.id);

  await tx.agentAssignment.updateMany({
    where: { agentId: { in: ids }, active: true },
    data: { active: false, endedAt: now },
  });

  await tx.agentAssignment.createMany({
    data: ids.map((agentId) => ({
      agentId,
      tcUserId,
      startedAt: now,
      active: true,
    })),
  });

  await tx.agent.updateMany({
    where: { id: { in: ids } },
    data: { tcUserId },
  });

  return agents.length;
}
