import type { UserRole } from "@prisma/client";

/**
 * Product-facing staff roles for SAMU network redesign.
 * Ops Manager and MD Viewer remain in the DB enum for legacy rows but are
 * soft-removed from the product (not seeded, not creatable).
 */
export const PRODUCT_STAFF_ROLES = [
  "ADMIN",
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
] as const satisfies readonly UserRole[];

/** Roles that may still exist in DB but are hidden from create/edit pickers. */
export const LEGACY_HIDDEN_ROLES = [
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
] as const satisfies readonly UserRole[];

export const CREATABLE_USER_ROLES = [
  ...PRODUCT_STAFF_ROLES,
  "AGENT",
] as const satisfies readonly UserRole[];

export function isAdmin(role: UserRole): boolean {
  return role === "ADMIN";
}

export function isTc(role: UserRole): boolean {
  return role === "TERRITORY_COORDINATOR";
}

export function isCoa(role: UserRole): boolean {
  return role === "COMMUNITY_OPPORTUNITY_ASSOCIATE";
}

/** National (unscoped) readers — Admin plus legacy Ops/MD. */
export function isNationalReader(role: UserRole): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "MD_VIEWER"
  );
}

/** Roles that can mutate operational data. */
export function canWrite(role: UserRole): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR" ||
    role === "COMMUNITY_OPPORTUNITY_ASSOCIATE" ||
    role === "AGENT"
  );
}

/** Head-office style reviewers (Admin + legacy Ops). */
export function isHoReviewer(role: UserRole): boolean {
  return role === "ADMIN" || role === "OPERATIONS_MANAGER";
}
