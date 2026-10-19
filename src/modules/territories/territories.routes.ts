import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  assignCoordinator,
  getCoordinators,
  getTree,
  getWorkspace,
} from "./territories.controller.js";

const TERRITORY_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

export const territoriesRouter = Router();

territoriesRouter.use(authenticate);

territoriesRouter.get(
  "/tree",
  requireRoles(...TERRITORY_READERS),
  getTree,
);

territoriesRouter.get(
  "/coordinators",
  requireRoles(...TERRITORY_READERS),
  getCoordinators,
);

territoriesRouter.get(
  "/:id/workspace",
  requireRoles(...TERRITORY_READERS),
  getWorkspace,
);

territoriesRouter.post(
  "/:id/assign",
  requireWrite,
  requireRoles("ADMIN"),
  assignCoordinator,
);
