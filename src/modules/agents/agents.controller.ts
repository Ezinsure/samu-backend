import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  agentIdParamSchema,
  agentInputSchema,
  agentListQuerySchema,
  assignTcSchema,
  pipelineActionSchema,
  reviewActionSchema,
} from "./agents.schemas.js";
import * as agentsService from "./agents.service.js";

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

export const pipeline: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = agentIdParamSchema.parse(req.params);
    const body = pipelineActionSchema.parse(req.body);
    const agent = await agentsService.applyPipelineAction(id, body, req.user);
    res.json({ data: { agent } });
  } catch (error) {
    next(error);
  }
};

export const review: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = agentIdParamSchema.parse(req.params);
    const body = reviewActionSchema.parse(req.body);
    const agent = await agentsService.reviewAgent(id, body.action, req.user);
    res.json({ data: { agent } });
  } catch (error) {
    next(error);
  }
};

export const assignTc: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = agentIdParamSchema.parse(req.params);
    const body = assignTcSchema.parse(req.body);
    const agent = await agentsService.assignTerritoryCoordinator(
      id,
      body.tcUserId,
      req.user,
    );
    res.json({ data: { agent } });
  } catch (error) {
    next(error);
  }
};
