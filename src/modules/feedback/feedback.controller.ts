import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  feedbackIdParamSchema,
  feedbackInputSchema,
  feedbackListQuerySchema,
} from "./feedback.schemas.js";
import * as feedbackService from "./feedback.service.js";

/**
 * GET /api/v1/feedback — paginated community feedback.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = feedbackListQuerySchema.parse(req.query);
    const result = await feedbackService.listFeedback(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/feedback/:id — single item.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = feedbackIdParamSchema.parse(req.params);
    const feedback = await feedbackService.getFeedbackById(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { feedback } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/feedback — create (Admin / Ops / TC).
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = feedbackInputSchema.parse(req.body);
    const feedback = await feedbackService.createFeedback(body, req.user);
    res.status(201).json({ data: { feedback } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/feedback/:id — update (Admin / Ops / owning TC).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = feedbackIdParamSchema.parse(req.params);
    const body = feedbackInputSchema.parse(req.body);
    const feedback = await feedbackService.updateFeedback(id, body, req.user);
    res.json({ data: { feedback } });
  } catch (error) {
    next(error);
  }
};
