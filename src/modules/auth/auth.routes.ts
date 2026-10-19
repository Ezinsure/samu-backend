import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireWrite } from "../../middleware/rbac.js";
import {
  login,
  logout,
  me,
  rbacWriteCheck,
  refresh,
  register,
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

export const authRouter = Router();

authRouter.post("/register", authLimiter, register);
authRouter.post("/login", authLimiter, login);
authRouter.post("/logout", logout);
authRouter.post("/refresh", authLimiter, refresh);
authRouter.get("/me", authenticate, me);

/** B1 RBAC probe — MD_VIEWER must receive 403. */
authRouter.post(
  "/rbac-write-check",
  authenticate,
  requireWrite,
  rbacWriteCheck,
);
