import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { coapDashboard, coapFilterOptions } from "./insights.controller.js";

const INSIGHT_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

export const insightsRouter = Router();

insightsRouter.use(authenticate);

insightsRouter.get(
  "/coap-dashboard",
  requireRoles(...INSIGHT_READERS),
  coapDashboard,
);

insightsRouter.get(
  "/coap-filter-options",
  requireRoles(...INSIGHT_READERS),
  coapFilterOptions,
);
