import type { UserRole } from "@prisma/client";
import type { RequestHandler } from "express";
import { errors } from "../lib/errors.js";

/** Roles that may perform mutating (write) operations. MD_VIEWER is read-only. */
const WRITE_ROLES: ReadonlySet<UserRole> = new Set([
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
  "AGENT",
]);

/**
 * Restrict a route to one or more roles. Must run after `authenticate`.
 */
export function requireRoles(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(errors.unauthorized());
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(errors.forbidden());
      return;
    }
    next();
  };
}

/**
 * Block read-only roles (MD_VIEWER) from mutating endpoints.
 * Apply on every POST/PATCH/PUT/DELETE that changes operational data.
 * Logout/refresh are exempt — they do not use this middleware.
 */
export const requireWrite: RequestHandler = (req, _res, next) => {
  if (!req.user) {
    next(errors.unauthorized());
    return;
  }
  if (!WRITE_ROLES.has(req.user.role)) {
    next(errors.forbidden("Read-only role cannot modify resources"));
    return;
  }
  next();
};
