import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  activityIdParamSchema,
  activityInputSchema,
  activityListQuerySchema,
} from "./activities.schemas.js";
import * as activitiesService from "./activities.service.js";

/**
 * GET /api/v1/field-activities — paginated list.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = activityListQuerySchema.parse(req.query);
    const result = await activitiesService.listActivities(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/field-activities/:id — single activity.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = activityIdParamSchema.parse(req.params);
    const activity = await activitiesService.getActivityById(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { activity } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/field-activities — create (Admin / Ops / TC).
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = activityInputSchema.parse(req.body);
    const activity = await activitiesService.createActivity(body, req.user);
    res.status(201).json({ data: { activity } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/field-activities/:id — update (Admin / Ops / owning TC).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = activityIdParamSchema.parse(req.params);
    const body = activityInputSchema.parse(req.body);
    const activity = await activitiesService.updateActivity(id, body, req.user);
    res.json({ data: { activity } });
  } catch (error) {
    next(error);
  }
};
