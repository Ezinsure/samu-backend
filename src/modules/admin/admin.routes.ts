import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  auditFilters,
  getSettings,
  listAudit,
  patchSettings,
} from "./admin.controller.js";

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get(
  "/settings",
  requireRoles("ADMIN", "OPERATIONS_MANAGER"),
  getSettings,
);

adminRouter.patch(
  "/settings",
  requireWrite,
  requireRoles("ADMIN"),
  patchSettings,
);

adminRouter.get(
  "/audit/filters",
  requireRoles("ADMIN", "OPERATIONS_MANAGER"),
  auditFilters,
);

adminRouter.get(
  "/audit",
  requireRoles("ADMIN", "OPERATIONS_MANAGER"),
  listAudit,
);