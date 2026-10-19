import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  fraudIdParamSchema,
  fraudListQuerySchema,
  fraudReviewSchema,
} from "./fraud.schemas.js";
import * as fraudService from "./fraud.service.js";

/**
 * GET /api/v1/fraud/filters — type / status / severity options.
 */
export const filters: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await fraudService.getFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/fraud — paginated fraud flags (Admin / Ops / MD).
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = fraudListQuerySchema.parse(req.query);
    const result = await fraudService.listFlags(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/fraud/:id — flag detail + linked visit + review history.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = fraudIdParamSchema.parse(req.params);
    const data = await fraudService.getFlagDetail(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/fraud/:id/review — accept | escalate | dismiss (Admin / Ops).
 */
export const review: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = fraudIdParamSchema.parse(req.params);
    const body = fraudReviewSchema.parse(req.body);
    const flag = await fraudService.reviewFlag(id, body, req.user);
    res.json({ data: { flag } });
  } catch (error) {
    next(error);
  }
};
