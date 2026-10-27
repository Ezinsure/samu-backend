import { Prisma } from "@prisma/client";
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
import type { AgentInput, AgentListQuery } from "./agents.schemas.js";

function canManageAgents(role: AuthUser["role"]): boolean {
  return role === "ADMIN";
}

function assertCanViewAgent(agentTcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && agentTcUserId === viewer.id) {
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

/**
 * Filter-option facets for the agents list UI (scoped for TCs).
 */
export async function getFilterOptions(viewer: AuthUser) {
  const where: Prisma.AgentWhereInput =
    viewer.role === "TERRITORY_COORDINATOR" ? { tcUserId: viewer.id } : {};

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
  const statuses = [
    ...new Set(
      agents.map((a) =>
        a.status === "PendingVerification" ? "Pending verification" : a.status,
      ),
    ),
  ].sort();

  return { provinces, districts, statuses, coordinators };
}

/**
 * Paginated agent list with filters, search, and TC scoping.
 */
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
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.province) where.geoProvince = query.province;
  if (query.district) where.geoDistrict = query.district;
  if (query.status) where.status = statusFromApi(query.status);
  if (query.compliance) where.compliance = query.compliance;
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
    include: { tcUser: { select: { name: true } } },
    orderBy,
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => toPublicAgent(row, row.tcUser.name)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

/**
 * Agent detail + assignment history + recent visits.
 */
export async function getAgentDetail(id: string, viewer: AuthUser) {
  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      tcUser: { select: { name: true } },
      assignments: {
        include: { tcUser: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!agent) {
    throw errors.notFound("Agent not found");
  }
  assertCanViewAgent(agent.tcUserId, viewer);

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
    agent: toPublicAgent(agent, agent.tcUser.name),
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
    tcName: agent.tcUser.name,
  };
}

/**
 * Create agent (Admin). Opens an active AgentAssignment for the TC.
 */
export async function createAgent(
  input: AgentInput,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (!canManageAgents(actor.role)) {
    throw errors.forbidden();
  }

  await assertActiveTc(input.tcUserId);

  const code = input.code?.trim() || (await nextAgentCode());
  const existingCode = await prisma.agent.findUnique({ where: { code } });
  if (existingCode) {
    throw errors.conflict(`Agent code ${code} already exists`);
  }

  const id = `agent-${Date.now()}`;
  const now = new Date();
  const services = { ...DEFAULT_AGENT_SERVICES, ...input.services };

  // Sequential batch — Neon PgBouncer does not support interactive transactions.
  const [agent] = await prisma.$transaction([
    prisma.agent.create({
      data: {
        id,
        code,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim() || null,
        nidMasked: maskNidFromPhone(input.phone),
        nidVerified: input.nidVerified ?? false,
        status: statusFromApi(input.status),
        geoProvince: input.geo.province,
        geoDistrict: input.geo.district,
        geoSector: input.geo.sector,
        geoCell: input.geo.cell,
        lat: input.registeredLocation.lat,
        lng: input.registeredLocation.lng,
        accuracyMeters: 5,
        tcUserId: input.tcUserId,
        servicesJson: services,
        compliance: "yellow",
        clientsRegistered: input.clientsRegistered ?? 0,
        recruitedThisMonth: input.recruitedThisMonth ?? true,
        reactivatedThisMonth: input.reactivatedThisMonth ?? false,
        createdAt: now,
      },
      include: { tcUser: { select: { name: true } } },
    }),
    prisma.agentAssignment.create({
      data: {
        agentId: id,
        tcUserId: input.tcUserId,
        startedAt: now,
        active: true,
      },
    }),
  ]);

  logger.info(
    { agentId: agent.id, code: agent.code, actorUserId: actor.id },
    "Agent created",
  );

  return toPublicAgent(agent, agent.tcUser.name);
}

/**
 * Update agent (Admin). Rotates AgentAssignment when TC changes.
 */
export async function updateAgent(
  id: string,
  input: AgentInput,
  actor: AuthUser,
): Promise<PublicAgent> {
  if (!canManageAgents(actor.role)) {
    throw errors.forbidden();
  }

  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Agent not found");
  }

  await assertActiveTc(input.tcUserId);

  const code = input.code?.trim() || existing.code;
  if (code !== existing.code) {
    const clash = await prisma.agent.findUnique({ where: { code } });
    if (clash) {
      throw errors.conflict(`Agent code ${code} already exists`);
    }
  }

  const previousTc = existing.tcUserId;
  const now = new Date();
  const services = { ...DEFAULT_AGENT_SERVICES, ...input.services };

  const agentUpdate = prisma.agent.update({
    where: { id },
    data: {
      code,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      nidMasked: maskNidFromPhone(input.phone),
      nidVerified: input.nidVerified ?? existing.nidVerified,
      status: statusFromApi(input.status),
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      geoCell: input.geo.cell,
      lat: input.registeredLocation.lat,
      lng: input.registeredLocation.lng,
      tcUserId: input.tcUserId,
      servicesJson: services,
      clientsRegistered: input.clientsRegistered ?? existing.clientsRegistered,
      recruitedThisMonth:
        input.recruitedThisMonth ?? existing.recruitedThisMonth,
      reactivatedThisMonth:
        input.reactivatedThisMonth ?? existing.reactivatedThisMonth,
    },
    include: { tcUser: { select: { name: true } } },
  });

  const agent =
    previousTc !== input.tcUserId
      ? (
          await prisma.$transaction([
            prisma.agentAssignment.updateMany({
              where: { agentId: id, active: true },
              data: { active: false, endedAt: now },
            }),
            prisma.agentAssignment.create({
              data: {
                agentId: id,
                tcUserId: input.tcUserId,
                startedAt: now,
                active: true,
              },
            }),
            agentUpdate,
          ])
        )[2]
      : await agentUpdate;

  logger.info(
    {
      agentId: id,
      actorUserId: actor.id,
      reassigned: previousTc !== input.tcUserId,
    },
    "Agent updated",
  );

  return toPublicAgent(agent, agent.tcUser.name);
}

/**
 * Agents matching a territory node (by geo name hierarchy).
 * Used by territory workspace / tree counts.
 */
export async function findAgentsForTerritory(opts: {
  type: "province" | "district" | "sector" | "cell";
  name: string;
  /** When type is province, limit by child district names. */
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

/**
 * Reassign all agents in a district to a new TC (territory assign cascade).
 */
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
