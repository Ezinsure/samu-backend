import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  assignTcBodySchema,
  territoryIdParamSchema,
} from "./territories.schemas.js";
import * as territoriesService from "./territories.service.js";

/**
 * GET /api/v1/territories/tree — geo tree + coordinator picker + canManage.
 */
export const getTree: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw errors.unauthorized();
    }
    const data = await territoriesService.getTerritoryTree(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/territories/coordinators — active TC users for assignment UI.
 */
export const getCoordinators: RequestHandler = async (_req, res, next) => {
  try {
    const coordinators = await territoriesService.listCoordinators();
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { coordinators } });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/territories/:id/workspace — detail + assignment history.
 */
export const getWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw errors.unauthorized();
    }
    const { id } = territoryIdParamSchema.parse(req.params);
    const workspace = await territoriesService.getTerritoryWorkspace(
      id,
      req.user,
    );
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: workspace });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/territories/:id/assign — Admin assigns a TC to a district.
 */
export const assignCoordinator: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) {
      throw errors.unauthorized();
    }
    const { id } = territoryIdParamSchema.parse(req.params);
    const body = assignTcBodySchema.parse(req.body);
    const result = await territoriesService.assignTerritoryCoordinator(
      id,
      body.tcUserId,
      req.user,
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
