import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { mapWorkspace } from "../insights/insights.controller.js";

const MAP_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

export const mapsRouter = Router();

mapsRouter.use(authenticate);

mapsRouter.get("/workspace", requireRoles(...MAP_READERS), mapWorkspace);
