import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  create,
  getById,
  getFilters,
  list,
  update,
} from "./agents.controller.js";

const AGENT_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

export const agentsRouter = Router();

agentsRouter.use(authenticate);

agentsRouter.get("/filters", requireRoles(...AGENT_READERS), getFilters);
agentsRouter.get("/", requireRoles(...AGENT_READERS), list);
agentsRouter.get("/:id", requireRoles(...AGENT_READERS), getById);

agentsRouter.post("/", requireWrite, requireRoles("ADMIN"), create);
agentsRouter.patch("/:id", requireWrite, requireRoles("ADMIN"), update);
