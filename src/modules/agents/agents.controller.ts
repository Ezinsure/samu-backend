import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  agentIdParamSchema,
  agentInputSchema,
  agentListQuerySchema,
} from "./agents.schemas.js";
import * as agentsService from "./agents.service.js";

/**
 * GET /api/v1/agents/filters — facet options for list UI.
 */
export const getFilters: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await agentsService.getFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/agents — paginated list.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = agentListQuerySchema.parse(req.query);
    const result = await agentsService.listAgents(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/agents/:id — detail (visits empty until B10).
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = agentIdParamSchema.parse(req.params);
    const detail = await agentsService.getAgentDetail(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: detail });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/agents — Admin create.
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = agentInputSchema.parse(req.body);
    const agent = await agentsService.createAgent(body, req.user);
    res.status(201).json({ data: { agent } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/agents/:id — Admin update.
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = agentIdParamSchema.parse(req.params);
    const body = agentInputSchema.parse(req.body);
    const agent = await agentsService.updateAgent(id, body, req.user);
    res.json({ data: { agent } });
  } catch (error) {
    next(error);
  }
};
