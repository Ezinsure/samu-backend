import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  create,
  filters,
  getWorkspace,
  list,
  refreshKpis,
  requestChanges,
  saveDraft,
  submit,
} from "./reports.controller.js";

const REPORT_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const REPORT_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

const REPORT_REVIEWERS = ["ADMIN", "OPERATIONS_MANAGER"] as const;

export const reportsRouter = Router();

reportsRouter.use(authenticate);

reportsRouter.get("/filters", requireRoles(...REPORT_READERS), filters);
reportsRouter.get("/", requireRoles(...REPORT_READERS), list);
reportsRouter.get("/:id", requireRoles(...REPORT_READERS), getWorkspace);

reportsRouter.post("/", requireWrite, requireRoles(...REPORT_WRITERS), create);
reportsRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...REPORT_WRITERS),
  saveDraft,
);
reportsRouter.post(
  "/:id/refresh-kpis",
  requireWrite,
  requireRoles(...REPORT_WRITERS),
  refreshKpis,
);
reportsRouter.post(
  "/:id/submit",
  requireWrite,
  requireRoles(...REPORT_WRITERS),
  submit,
);
reportsRouter.post(
  "/:id/request-changes",
  requireWrite,
  requireRoles(...REPORT_REVIEWERS),
  requestChanges,
);
