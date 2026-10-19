import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  leadIdParamSchema,
  leadInputSchema,
  leadListQuerySchema,
} from "./leads.schemas.js";
import * as leadsService from "./leads.service.js";

/**
 * GET /api/v1/leads — paginated COAP leads.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = leadListQuerySchema.parse(req.query);
    const result = await leadsService.listLeads(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/leads/:id — single lead.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = leadIdParamSchema.parse(req.params);
    const lead = await leadsService.getLeadById(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { lead } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/leads — create (Admin / Ops / TC).
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = leadInputSchema.parse(req.body);
    const lead = await leadsService.createLead(body, req.user);
    res.status(201).json({ data: { lead } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/leads/:id — update (Admin / Ops / owning TC).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = leadIdParamSchema.parse(req.params);
    const body = leadInputSchema.parse(req.body);
    const lead = await leadsService.updateLead(id, body, req.user);
    res.json({ data: { lead } });
  } catch (error) {
    next(error);
  }
};
