import type { UserRole } from "@prisma/client";
import { errors } from "./errors.js";
import { prisma } from "./prisma.js";

export type ScopeActor = {
  id: string;
  role: UserRole;
};

/**
 * District IDs with an active assignment for this TC.
 */
export async function getTcTerritoryIds(tcUserId: string): Promise<string[]> {
  const rows = await prisma.territoryAssignment.findMany({
    where: { tcUserId, active: true },
    select: { territoryId: true },
  });
  return rows.map((r) => r.territoryId);
}

/**
 * Full set of territory IDs a TC may see: assigned districts, their ancestors
 * (provinces), and all descendants (sectors/cells).
 */
export async function getTcScopedTerritoryIds(
  tcUserId: string,
): Promise<Set<string>> {
  const districtIds = await getTcTerritoryIds(tcUserId);
  if (districtIds.length === 0) {
    return new Set();
  }

  const all = await prisma.territory.findMany({
    select: { id: true, parentId: true },
  });

  const byId = new Map(all.map((t) => [t.id, t]));
  const childrenOf = new Map<string, string[]>();
  for (const t of all) {
    if (!t.parentId) continue;
    const list = childrenOf.get(t.parentId) ?? [];
    list.push(t.id);
    childrenOf.set(t.parentId, list);
  }

  const scoped = new Set<string>();

  // Ancestors of each assigned district.
  for (const districtId of districtIds) {
    let current: string | null | undefined = districtId;
    while (current) {
      scoped.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
  }

  // Descendants of each assigned district.
  const queue = [...districtIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    scoped.add(id);
    for (const childId of childrenOf.get(id) ?? []) {
      queue.push(childId);
    }
  }

  return scoped;
}

/**
 * National roles see everything; TCs are limited to their scoped territories.
 * Throws AppError 403 when a TC is outside their scope.
 */
export async function assertTcTerritoryAccess(
  actor: ScopeActor,
  territoryId: string,
): Promise<void> {
  if (
    actor.role === "ADMIN" ||
    actor.role === "OPERATIONS_MANAGER" ||
    actor.role === "MD_VIEWER"
  ) {
    return;
  }

  if (actor.role !== "TERRITORY_COORDINATOR") {
    throw errors.forbidden();
  }

  const allowed = await getTcScopedTerritoryIds(actor.id);
  if (!allowed.has(territoryId)) {
    throw errors.forbidden("Outside assigned territory scope");
  }
}

/**
 * True when the actor may access national (unscoped) data.
 */
export function isNationalReader(role: UserRole): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "MD_VIEWER"
  );
}
