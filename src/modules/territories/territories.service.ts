import type { Territory, TerritoryType } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import {
  assertTcTerritoryAccess,
  getTcScopedTerritoryIds,
  isNationalReader,
} from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";

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
  /** Agents land in Phase B3 — empty until then. */
  agents: [];
  childSummary: Array<{
    id: string;
    name: string;
    type: TerritoryType;
    agentCount: number;
    tcName?: string;
  }>;
  history: TerritoryAssignmentView[];
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
    // AGENT and other non-national roles: empty tree for now.
    visible = [];
  }

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
      agentCount: 0,
      children: build(t.id),
    }));
  };

  // Roots are provinces (parentId null). If a TC only sees a subtree, still
  // attach from null so provinces appear when included in the allowed set.
  return {
    tree: build(null),
    coordinators: await listCoordinators(),
    canManage: canManageTerritories(viewer.role),
  };
}

/**
 * Detail workspace for one territory (agents deferred to B3).
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

  return {
    territory: toPublic(territory),
    parentName: territory.parent?.name,
    tcName: territory.activeTc?.name,
    agents: [],
    childSummary: territory.children.map((child) => ({
      id: child.id,
      name: child.name,
      type: child.type,
      agentCount: 0,
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
 * Closes prior active assignment history rows and updates denormalized TC.
 * Agent reassignment is Phase B3.
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

  await prisma.$transaction(async (tx) => {
    await tx.territoryAssignment.updateMany({
      where: { territoryId, active: true },
      data: { active: false, endedAt: now },
    });

    await tx.territoryAssignment.create({
      data: {
        territoryId,
        tcUserId,
        startedAt: now,
        active: true,
      },
    });

    await tx.territory.update({
      where: { id: territoryId },
      data: { activeTcUserId: tcUserId },
    });
  });

  logger.info(
    {
      territoryId,
      previousTcUserId: previousTc,
      tcUserId,
      actorUserId: actor.id,
    },
    "Territory coordinator assigned",
  );

  return { ok: true };
}
