import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  auditListQuerySchema,
  settingsPatchSchema,
} from "./admin.schemas.js";
import * as adminService from "./admin.service.js";

/**
 * GET /api/v1/admin/settings
 */
export const getSettings: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await adminService.readSettings(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/settings — Admin only.
 */
export const patchSettings: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = settingsPatchSchema.parse(req.body);
    const data = await adminService.updateSettings(body, req.user, {
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/audit
 */
export const listAudit: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = auditListQuerySchema.parse(req.query);
    const result = await adminService.listAuditLogs(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/audit/filters
 */
export const auditFilters: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await adminService.getAuditFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
