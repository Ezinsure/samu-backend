import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  visitCreateSchema,
  visitIdParamSchema,
  visitListQuerySchema,
  visitPatchSchema,
} from "./visits.schemas.js";
import * as visitsService from "./visits.service.js";

/**
 * GET /api/v1/visits/filters — agents, purposes, GPS threshold.
 */
export const filters: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await visitsService.getFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/visits — paginated field visits.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = visitListQuerySchema.parse(req.query);
    const result = await visitsService.listVisits(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/visits/:id — detail + agent snapshot + fraud flags.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = visitIdParamSchema.parse(req.params);
    const data = await visitsService.getVisitDetail(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/visits/photos — multipart image upload → MinIO storage key.
 */
export const uploadPhoto: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const file = req.file;
    if (!file) throw errors.badRequest("photo file is required (field: photo)");
    const data = await visitsService.uploadPhoto(file, req.user);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/visits — create visit (GPS validated server-side).
 * Optional header: Idempotency-Key
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = visitCreateSchema.parse(req.body);
    const idempotencyKey = req.get("Idempotency-Key")?.trim() || undefined;
    const visit = await visitsService.createVisit(body, req.user, idempotencyKey);
    res.status(201).json({ data: { visit } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/visits/:id — limited updates (confirmation / validation).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = visitIdParamSchema.parse(req.params);
    const body = visitPatchSchema.parse(req.body);
    const visit = await visitsService.patchVisit(id, body, req.user);
    res.json({ data: { visit } });
  } catch (error) {
    next(error);
  }
};
