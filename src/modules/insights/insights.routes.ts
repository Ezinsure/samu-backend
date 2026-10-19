import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import {
  analyticsWorkspace,
  coapDashboard,
  coapFilterOptions,
  dashboard,
} from "./insights.controller.js";

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

insightsRouter.get("/dashboard", requireRoles(...INSIGHT_READERS), dashboard);

insightsRouter.get(
  "/analytics",
  requireRoles(...INSIGHT_READERS),
  analyticsWorkspace,
);
