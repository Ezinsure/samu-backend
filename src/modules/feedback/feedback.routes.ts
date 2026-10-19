import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { create, getById, list, update } from "./feedback.controller.js";

const FEEDBACK_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const FEEDBACK_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

export const feedbackRouter = Router();

feedbackRouter.use(authenticate);

feedbackRouter.get("/", requireRoles(...FEEDBACK_READERS), list);
feedbackRouter.get("/:id", requireRoles(...FEEDBACK_READERS), getById);

feedbackRouter.post("/", requireWrite, requireRoles(...FEEDBACK_WRITERS), create);
feedbackRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...FEEDBACK_WRITERS),
  update,
);
