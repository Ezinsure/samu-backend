import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./coa-metrics.service.js";

export const coaMetricsRouter = Router();

coaMetricsRouter.use(authenticate);

const READERS = [
  "ADMIN",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
] as const;

coaMetricsRouter.get(
  "/",
  requireRoles(...READERS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const includeDisabled =
        typeof req.query.includeDisabled === "string"
          ? req.query.includeDisabled === "true"
          : undefined;
      const data = await service.listMetrics(req.user, { includeDisabled });
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaMetricsRouter.get(
  "/:key",
  requireRoles(...READERS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const key = String(req.params.key);
      const data = await service.getMetricByKey(key, req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
