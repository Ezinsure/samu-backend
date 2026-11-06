import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireWrite } from "../../middleware/rbac.js";
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  me,
  rbacWriteCheck,
  refresh,
  register,
  removeAvatar,
  resetPassword,
  updateMe,
  uploadAvatar,
} from "./auth.controller.js";

/**
 * Auth rate limit (memory store for B1). Swap to Redis store when Redis client lands.
 * 20 attempts / 15 min per IP is enough to blunt credential stuffing locally.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many auth attempts. Try again later.",
      details: [],
    },
  },
});

/**
 * Stricter limit for flows that send email or accept one-time tokens:
 * 5 requests / 15 min per IP stops mail flooding and token guessing.
 */
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many attempts. Try again in a few minutes.",
      details: [],
    },
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

const avatarLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many avatar uploads. Try again later.",
      details: [],
    },
  },
});

export const authRouter = Router();

authRouter.post("/register", authLimiter, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/logout", logout);
authRouter.post("/refresh", authLimiter, refresh);
authRouter.get("/me", authenticate, me);
// Self-service: any signed-in role (including read-only MD) may manage its own account.
authRouter.patch("/me", authenticate, updateMe);
authRouter.post(
  "/me/avatar",
  authenticate,
  avatarLimiter,
  avatarUpload.single("file"),
  uploadAvatar,
);
authRouter.delete("/me/avatar", authenticate, removeAvatar);
authRouter.post("/change-password", authLimiter, authenticate, changePassword);
authRouter.post("/forgot-password", recoveryLimiter, forgotPassword);
authRouter.post("/reset-password", recoveryLimiter, resetPassword);

/** B1 RBAC probe — MD_VIEWER must receive 403. */
authRouter.post(
  "/rbac-write-check",
  authenticate,
  requireWrite,
  rbacWriteCheck,
);
