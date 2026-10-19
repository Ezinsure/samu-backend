import type { UserRole } from "@prisma/client";
import { errors } from "./errors.js";

export type ScopeActor = {
  id: string;
  role: UserRole;
};

/**
 * Returns territory IDs assigned to a Territory Coordinator.
 * Until Phase B2 (`territory_assignments`), this always returns [].
 * Callers should treat empty as "no territory access" for TCs.
 */
export async function getTcTerritoryIds(_tcUserId: string): Promise<string[]> {
  // B2: prisma.territoryAssignment.findMany({ where: { tcUserId, active: true } })
  return [];
}

/**
 * National roles see everything; TCs are limited to assigned territories (B2+).
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

  const allowed = await getTcTerritoryIds(actor.id);
  if (!allowed.includes(territoryId)) {
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
