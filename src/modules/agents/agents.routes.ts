import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  assignTc,
  create,
  getById,
  getFilters,
  list,
  pipeline,
  review,
  update,
} from "./agents.controller.js";

const AGENT_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
] as const;

const AGENT_WRITERS = [
  "ADMIN",
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
] as const;

const PIPELINE_ROLES = ["ADMIN", "OPERATIONS_MANAGER", "TERRITORY_COORDINATOR"] as const;

export const agentsRouter = Router();

agentsRouter.use(authenticate);

agentsRouter.get("/filters", requireRoles(...AGENT_READERS), getFilters);
agentsRouter.get("/", requireRoles(...AGENT_READERS), list);
agentsRouter.get("/:id", requireRoles(...AGENT_READERS), getById);

agentsRouter.post("/", requireWrite, requireRoles(...AGENT_WRITERS), create);
agentsRouter.patch("/:id", requireWrite, requireRoles("ADMIN", "TERRITORY_COORDINATOR"), update);
agentsRouter.post(
  "/:id/pipeline",
  requireWrite,
  requireRoles(...PIPELINE_ROLES),
  pipeline,
);
agentsRouter.post(
  "/:id/review",
  requireWrite,
  requireRoles("ADMIN", "TERRITORY_COORDINATOR", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  review,
);
agentsRouter.post("/:id/assign-tc", requireWrite, requireRoles("ADMIN"), assignTc);
