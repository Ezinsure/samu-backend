import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { filters, getById, list, review } from "./fraud.controller.js";

const FRAUD_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
] as const;

const FRAUD_REVIEWERS = ["ADMIN", "OPERATIONS_MANAGER"] as const;

export const fraudRouter = Router();

fraudRouter.use(authenticate);

fraudRouter.get("/filters", requireRoles(...FRAUD_READERS), filters);
fraudRouter.get("/", requireRoles(...FRAUD_READERS), list);
fraudRouter.get("/:id", requireRoles(...FRAUD_READERS), getById);

fraudRouter.post(
  "/:id/review",
  requireWrite,
  requireRoles(...FRAUD_REVIEWERS),
  review,
);
