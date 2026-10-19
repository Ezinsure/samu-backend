import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  dashboardFiltersSchema,
  mapFiltersSchema,
} from "./analytics.schemas.js";
import * as analyticsService from "./analytics.service.js";
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

/**
 * GET /api/v1/insights/dashboard — operations dashboard analytics.
 */
export const dashboard: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const filters = dashboardFiltersSchema.parse(req.query);
    const data = await analyticsService.getDashboardAnalytics(
      filters,
      req.user,
    );
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/insights/analytics — dashboard + SMS confirmation charts.
 */
export const analyticsWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const filters = dashboardFiltersSchema.parse(req.query);
    const data = await analyticsService.getAnalyticsWorkspace(
      filters,
      req.user,
    );
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/maps/workspace — agent geo points for the compliance map.
 */
export const mapWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const filters = mapFiltersSchema.parse(req.query);
    const data = await analyticsService.getMapWorkspace(filters, req.user);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
