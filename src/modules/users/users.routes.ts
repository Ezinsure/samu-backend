import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import {
  create,
  downloadCoaImportTemplate,
  getById,
  importCoas,
  list,
  previewImportCoas,
  remove,
  sendResetLink,
  setPassword,
  update,
} from "./users.controller.js";

/** User management is Admin-only, reads included. */
export const usersRouter = Router();

usersRouter.use(authenticate, requireRoles("ADMIN"));

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many COA imports. Try again later.",
      details: [],
    },
  },
});

usersRouter.get("/", list);
usersRouter.get("/coa-import-template.csv", downloadCoaImportTemplate);
usersRouter.post(
  "/import-coas/preview",
  requireWrite,
  importLimiter,
  importUpload.single("file"),
  previewImportCoas,
);
usersRouter.post(
  "/import-coas",
  requireWrite,
  importLimiter,
  importUpload.single("file"),
  importCoas,
);
usersRouter.get("/:id", getById);
usersRouter.post("/", requireWrite, create);
usersRouter.patch("/:id", requireWrite, update);
usersRouter.post("/:id/password", requireWrite, setPassword);
usersRouter.post("/:id/reset-link", requireWrite, sendResetLink);
usersRouter.delete("/:id", requireWrite, remove);
