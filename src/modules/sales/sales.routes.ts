import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { create, getById, list, update } from "./sales.controller.js";

const SALE_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

const SALE_WRITERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "TERRITORY_COORDINATOR",
] as const;

export const salesRouter = Router();

salesRouter.use(authenticate);

salesRouter.get("/", requireRoles(...SALE_READERS), list);
salesRouter.get("/:id", requireRoles(...SALE_READERS), getById);

salesRouter.post("/", requireWrite, requireRoles(...SALE_WRITERS), create);
salesRouter.patch("/:id", requireWrite, requireRoles(...SALE_WRITERS), update);
