import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { create, getById, list, update } from "./leads.controller.js";

const LEAD_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const LEAD_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

export const leadsRouter = Router();

leadsRouter.use(authenticate);

leadsRouter.get("/", requireRoles(...LEAD_READERS), list);
leadsRouter.get("/:id", requireRoles(...LEAD_READERS), getById);

leadsRouter.post("/", requireWrite, requireRoles(...LEAD_WRITERS), create);
leadsRouter.patch("/:id", requireWrite, requireRoles(...LEAD_WRITERS), update);
