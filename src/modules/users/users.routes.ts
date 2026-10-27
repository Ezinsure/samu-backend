import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  create,
  getById,
  list,
  remove,
  sendResetLink,
  setPassword,
  update,
} from "./users.controller.js";

/** User management is Admin-only, reads included. */
export const usersRouter = Router();

usersRouter.use(authenticate, requireRoles("ADMIN"));

usersRouter.get("/", list);
usersRouter.get("/:id", getById);
usersRouter.post("/", requireWrite, create);
usersRouter.patch("/:id", requireWrite, update);
usersRouter.post("/:id/password", requireWrite, setPassword);
usersRouter.post("/:id/reset-link", requireWrite, sendResetLink);
usersRouter.delete("/:id", requireWrite, remove);
