import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { create, getById, list, update } from "./activities.controller.js";

const ACTIVITY_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const ACTIVITY_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

export const activitiesRouter = Router();

activitiesRouter.use(authenticate);

activitiesRouter.get("/", requireRoles(...ACTIVITY_READERS), list);
activitiesRouter.get("/:id", requireRoles(...ACTIVITY_READERS), getById);

activitiesRouter.post(
  "/",
  requireWrite,
  requireRoles(...ACTIVITY_WRITERS),
  create,
);
activitiesRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...ACTIVITY_WRITERS),
  update,
);
