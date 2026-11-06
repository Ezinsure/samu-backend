import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./coa-performance.service.js";

export const coaPerformanceRouter = Router();

coaPerformanceRouter.use(authenticate);

coaPerformanceRouter.get(
  "/me",
  requireRoles("ADMIN", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const data = await service.getMyProgress(req.user, month);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
