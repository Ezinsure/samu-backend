import { Prisma, type Territory, type TerritoryType } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import {
  assertTcTerritoryAccess,
  getTcScopedTerritoryIds,
  isNationalReader,
} from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import { reassignAgentsInDistrict } from "../agents/agents.service.js";
import { toPublicAgent, type PublicAgent } from "../agents/agents.mapper.js";

export type PublicTerritory = {
  id: string;
  name: string;
  type: TerritoryType;
  parentId?: string;
  tcUserId?: string;
};

export type TerritoryNode = PublicTerritory & {
  children: TerritoryNode[];
  agentCount: number;
  tcName?: string;
};

export type TerritoryAssignmentView = {
  id: string;
  territoryId: string;
  territoryName: string;
  tcUserId: string;
  tcName: string;
  startedAt: string;
  endedAt?: string;
  active: boolean;
};

export type TerritoryWorkspace = {
  territory: PublicTerritory;
  parentName?: string;
  tcName?: string;
  agents: Array<PublicAgent & { tcName: string }>;
  childSummary: Array<{
    id: string;
    name: string;
    type: TerritoryType;
    agentCount: number;
    tcName?: string;
  }>;
  history: TerritoryAssignmentView[];
};

type AgentGeoRow = {
  geoProvince: string;
  geoDistrict: string;
  geoSector: string;
  geoCell: string;
  tcUserId: string;
};

function toPublic(t: Territory): PublicTerritory {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    parentId: t.parentId ?? undefined,
    tcUserId: t.activeTcUserId ?? undefined,
  };
}

function canManageTerritories(role: AuthUser["role"]): boolean {
  return role === "ADMIN";
}

function countAgentsForTerritory(
  territory: { id: string; name: string; type: TerritoryType; parentId: string | null },
  allTerritories: Array<{ id: string; name: string; type: TerritoryType; parentId: string | null }>,
  agents: AgentGeoRow[],
): number {
  if (territory.type === "province") {
    const districtNames = allTerritories
      .filter((item) => item.parentId === territory.id && item.type === "district")
      .map((item) => item.name);
    return agents.filter((agent) => districtNames.includes(agent.geoDistrict)).length;
  }
  if (territory.type === "district") {
    return agents.filter((agent) => agent.geoDistrict === territory.name).length;
  }
  if (territory.type === "sector") {
    return agents.filter((agent) => agent.geoSector === territory.name).length;
  }
  return agents.filter((agent) => agent.geoCell === territory.name).length;
}

/**
 * List active Territory Coordinators for assignment pickers.
 */
export async function listCoordinators(): Promise<Array<{ id: string; name: string }>> {
  const users = await prisma.user.findMany({
    where: { role: "TERRITORY_COORDINATOR", status: "active" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return users;
}

/**
 * Build the geo tree visible to the viewer (TC-scoped when applicable).
 */
export async function getTerritoryTree(viewer: AuthUser): Promise<{
  tree: TerritoryNode[];
  coordinators: Array<{ id: string; name: string }>;
  canManage: boolean;
}> {
  const all = await prisma.territory.findMany({
    include: { activeTc: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  let visible = all;
  if (viewer.role === "TERRITORY_COORDINATOR") {
    const allowed = await getTcScopedTerritoryIds(viewer.id);
    visible = all.filter((t) => allowed.has(t.id));
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    visible = [];
  }

  const agentWhere =
    viewer.role === "TERRITORY_COORDINATOR"
      ? { tcUserId: viewer.id }
      : {};
  const agents = await prisma.agent.findMany({
    where: agentWhere,
    select: {
      geoProvince: true,
      geoDistrict: true,
      geoSector: true,
      geoCell: true,
      tcUserId: true,
    },
  });

  const flatTerritories = all.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    parentId: t.parentId,
  }));

  const byParent = new Map<string | null, typeof visible>();
  for (const t of visible) {
    const key = t.parentId ?? null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(t);
    byParent.set(key, bucket);
  }

  const build = (parentId: string | null): TerritoryNode[] => {
    const nodes = byParent.get(parentId) ?? [];
    return nodes.map((t) => ({
      ...toPublic(t),
      tcName: t.activeTc?.name,
      agentCount: countAgentsForTerritory(
        { id: t.id, name: t.name, type: t.type, parentId: t.parentId },
        flatTerritories,
        agents,
      ),
      children: build(t.id),
    }));
  };

  return {
    tree: build(null),
    coordinators: await listCoordinators(),
    canManage: canManageTerritories(viewer.role),
  };
}

/**
 * Detail workspace for one territory including scoped agents.
 */
export async function getTerritoryWorkspace(
  territoryId: string,
  viewer: AuthUser,
): Promise<TerritoryWorkspace> {
  await assertTcTerritoryAccess(viewer, territoryId);

  const territory = await prisma.territory.findUnique({
    where: { id: territoryId },
    include: {
      activeTc: { select: { name: true } },
      parent: { select: { name: true } },
      children: {
        include: { activeTc: { select: { name: true } } },
        orderBy: { name: "asc" },
      },
      assignments: {
        include: { tcUser: { select: { name: true } } },
        orderBy: { startedAt: "desc" },
      },
    },
  });

  if (!territory) {
    throw errors.notFound("Territory not found");
  }

  const allTerritories = await prisma.territory.findMany({
    select: { id: true, name: true, type: true, parentId: true },
  });

  const agentWhere: Prisma.AgentWhereInput = {};
  if (viewer.role === "TERRITORY_COORDINATOR") {
    agentWhere.tcUserId = viewer.id;
  }

  if (territory.type === "province") {
    const districtNames = allTerritories
      .filter((item) => item.parentId === territory.id && item.type === "district")
      .map((item) => item.name);
    agentWhere.geoDistrict = { in: districtNames };
  } else if (territory.type === "district") {
    agentWhere.geoDistrict = territory.name;
  } else if (territory.type === "sector") {
    agentWhere.geoSector = territory.name;
  } else {
    agentWhere.geoCell = territory.name;
  }

  const agentRows = await prisma.agent.findMany({
    where: agentWhere,
    include: { tcUser: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  const countWhere: Prisma.AgentWhereInput =
    viewer.role === "TERRITORY_COORDINATOR" ? { tcUserId: viewer.id } : {};

  const allAgentsForCounts = await prisma.agent.findMany({
    where: countWhere,
    select: {
      geoProvince: true,
      geoDistrict: true,
      geoSector: true,
      geoCell: true,
      tcUserId: true,
    },
  });

  return {
    territory: toPublic(territory),
    parentName: territory.parent?.name,
    tcName: territory.activeTc?.name,
    agents: agentRows.map((row) => ({
      ...toPublicAgent(row, row.tcUser.name),
      tcName: row.tcUser.name,
    })),
    childSummary: territory.children.map((child) => ({
      id: child.id,
      name: child.name,
      type: child.type,
      agentCount: countAgentsForTerritory(
        {
          id: child.id,
          name: child.name,
          type: child.type,
          parentId: child.parentId,
        },
        allTerritories,
        allAgentsForCounts,
      ),
      tcName: child.activeTc?.name,
    })),
    history: territory.assignments.map((a) => ({
      id: a.id,
      territoryId: a.territoryId,
      territoryName: territory.name,
      tcUserId: a.tcUserId,
      tcName: a.tcUser.name,
      startedAt: a.startedAt.toISOString(),
      endedAt: a.endedAt?.toISOString(),
      active: a.active,
    })),
  };
}

/**
 * Assign / reassign a TC to a district. Admin only.
 * Closes prior territory assignment, updates denormalized TC,
 * and reassigns agents in that district to the new TC.
 */
export async function assignTerritoryCoordinator(
  territoryId: string,
  tcUserId: string,
  actor: AuthUser,
): Promise<{ ok: true }> {
  if (!canManageTerritories(actor.role)) {
    throw errors.forbidden();
  }

  const territory = await prisma.territory.findUnique({
    where: { id: territoryId },
  });
  if (!territory) {
    throw errors.notFound("Territory not found");
  }
  if (territory.type !== "district") {
    throw errors.badRequest("Only districts can be assigned to a coordinator");
  }

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

  if (territory.activeTcUserId === tcUserId) {
    throw errors.conflict("This district is already assigned to that coordinator");
  }

  const now = new Date();
  const previousTc = territory.activeTcUserId;

  // Sequential ops — Neon PgBouncer drops interactive `$transaction(async …)`.
  await prisma.$transaction([
    prisma.territoryAssignment.updateMany({
      where: { territoryId, active: true },
      data: { active: false, endedAt: now },
    }),
    prisma.territoryAssignment.create({
      data: {
        territoryId,
        tcUserId,
        startedAt: now,
        active: true,
      },
    }),
    prisma.territory.update({
      where: { id: territoryId },
      data: { activeTcUserId: tcUserId },
    }),
  ]);
  const agentCount = await reassignAgentsInDistrict(territory.name, tcUserId);

  logger.info(
    {
      territoryId,
      previousTcUserId: previousTc,
      tcUserId,
      actorUserId: actor.id,
      agentsUpdated: agentCount,
    },
    "Territory coordinator assigned",
  );

  return { ok: true };
}
