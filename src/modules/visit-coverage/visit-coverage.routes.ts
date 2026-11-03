import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./visit-coverage.service.js";

export const visitCoverageRouter = Router();
visitCoverageRouter.use(authenticate);

visitCoverageRouter.get(
  "/",
  requireRoles("ADMIN", "TERRITORY_COORDINATOR"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.getVisitCoverage(req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
