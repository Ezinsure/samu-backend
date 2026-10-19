import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { create, getById, list, update } from "./onboarding.controller.js";

const ONBOARDING_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const ONBOARDING_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

export const onboardingRouter = Router();

onboardingRouter.use(authenticate);

onboardingRouter.get("/", requireRoles(...ONBOARDING_READERS), list);
onboardingRouter.get("/:id", requireRoles(...ONBOARDING_READERS), getById);

onboardingRouter.post(
  "/",
  requireWrite,
  requireRoles(...ONBOARDING_WRITERS),
  create,
);
onboardingRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...ONBOARDING_WRITERS),
  update,
);
