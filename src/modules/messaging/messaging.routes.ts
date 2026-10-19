import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { list, sendSms, status } from "./messaging.controller.js";

const MESSAGING_ROLES = ["ADMIN", "OPERATIONS_MANAGER"] as const;

export const messagingRouter = Router();

messagingRouter.use(authenticate);

messagingRouter.get("/status", requireRoles(...MESSAGING_ROLES), status);
messagingRouter.get("/", requireRoles(...MESSAGING_ROLES), list);
messagingRouter.post(
  "/sms",
  requireWrite,
  requireRoles(...MESSAGING_ROLES),
  sendSms,
);
