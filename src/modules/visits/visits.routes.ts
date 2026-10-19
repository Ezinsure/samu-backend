import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  create,
  filters,
  getById,
  list,
  update,
  uploadPhoto,
} from "./visits.controller.js";

const VISIT_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const VISIT_WRITERS = ["ADMIN", "TERRITORY_COORDINATOR"] as const;

const VISIT_PATCHERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

export const visitsRouter = Router();

visitsRouter.use(authenticate);

visitsRouter.get("/filters", requireRoles(...VISIT_READERS), filters);
visitsRouter.get("/", requireRoles(...VISIT_READERS), list);
visitsRouter.get("/:id", requireRoles(...VISIT_READERS), getById);

visitsRouter.post(
  "/photos",
  requireWrite,
  requireRoles(...VISIT_WRITERS),
  upload.single("photo"),
  uploadPhoto,
);

visitsRouter.post(
  "/",
  requireWrite,
  requireRoles(...VISIT_WRITERS),
  create,
);

visitsRouter.patch(
  "/:id",
  requireWrite,
  requireRoles(...VISIT_PATCHERS),
  update,
);
