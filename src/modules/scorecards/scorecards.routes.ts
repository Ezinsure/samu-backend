import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  ensure,
  getWorkspace,
  list,
  saveDraft,
  submit,
} from "./scorecards.controller.js";

const SCORECARD_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const SCORECARD_EVALUATORS = ["ADMIN", "OPERATIONS_MANAGER"] as const;

export const scorecardsRouter = Router();

scorecardsRouter.use(authenticate);

scorecardsRouter.get("/", requireRoles(...SCORECARD_READERS), list);

scorecardsRouter.post(
  "/ensure",
  requireWrite,
  requireRoles(...SCORECARD_EVALUATORS),
  ensure,
);

scorecardsRouter.get("/:id", requireRoles(...SCORECARD_READERS), getWorkspace);

scorecardsRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...SCORECARD_EVALUATORS),
  saveDraft,
);

scorecardsRouter.post(
  "/:id/submit",
  requireWrite,
  requireRoles(...SCORECARD_EVALUATORS),
  submit,
);
