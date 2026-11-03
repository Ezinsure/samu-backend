import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./support.service.js";

export const supportRouter = Router();
supportRouter.use(authenticate);

supportRouter.get(
  "/",
  requireRoles("ADMIN", "TERRITORY_COORDINATOR"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const agentId =
        typeof req.query.agentId === "string" ? req.query.agentId : undefined;
      const data = await service.listSupportLogs(req.user, agentId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

supportRouter.post(
  "/",
  requireWrite,
  requireRoles("ADMIN", "TERRITORY_COORDINATOR"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = service.supportCreateSchema.parse(req.body);
      const data = await service.createSupportLog(body, req.user);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);
