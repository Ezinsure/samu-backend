import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import { coapDashboardQuerySchema } from "./insights.schemas.js";
import * as insightsService from "./insights.service.js";

/**
 * GET /api/v1/insights/coap-dashboard — programme KPIs + recent items.
 */
export const coapDashboard: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = coapDashboardQuerySchema.parse(req.query);
    const data = await insightsService.getCoapDashboard(query, req.user);
    // Short private cache — aggregates are non-PII-heavy but still role-scoped.
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/insights/coap-filter-options — dropdown options for COAP forms.
 */
export const coapFilterOptions: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await insightsService.getCoapFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
