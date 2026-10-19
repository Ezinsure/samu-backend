import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { listServices, serviceWorkspace } from "./coap.controller.js";

const COAP_READERS = [
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
] as const;

export const coapRouter = Router();

coapRouter.use(authenticate);

coapRouter.get("/services", requireRoles(...COAP_READERS), listServices);
coapRouter.get(
  "/services/:line/workspace",
  requireRoles(...COAP_READERS),
  serviceWorkspace,
);
