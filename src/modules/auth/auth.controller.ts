import type { RequestHandler } from "express";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../lib/cookies.js";
import { loginBodySchema, registerBodySchema } from "./auth.schemas.js";
import * as authService from "./auth.service.js";

/**
 * POST /api/v1/auth/register — create pending AGENT (cannot log in yet).
 */
export const register: RequestHandler = async (req, res, next) => {
  try {
    const body = registerBodySchema.parse(req.body);
    const user = await authService.registerUser(body);
    res.status(201).json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/login — set httpOnly cookies; return user in body.
 */
export const login: RequestHandler = async (req, res, next) => {
  try {
    const body = loginBodySchema.parse(req.body);
    const session = await authService.loginUser(body, {
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    setAuthCookies(res, session.accessToken, session.refreshToken);
    res.json({ data: { user: session.user } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout — revoke refresh token and clear cookies.
 */
export const logout: RequestHandler = async (req, res, next) => {
  try {
    const refresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await authService.logoutSession(refresh);
    clearAuthCookies(res);
    res.json({ data: { ok: true } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/refresh — rotate refresh token; issue new cookie pair.
 */
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!raw) {
      clearAuthCookies(res);
      res.status(401).json({
        error: {
          code: "UNAUTHORIZED",
          message: "Refresh token missing",
          details: [],
        },
      });
      return;
    }

    const session = await authService.refreshSession(raw);
    setAuthCookies(res, session.accessToken, session.refreshToken);
    res.json({ data: { user: session.user } });
  } catch (error) {
    clearAuthCookies(res);
    next(error);
  }
};

/**
 * GET /api/v1/auth/me — current authenticated user (requires access cookie).
 */
export const me: RequestHandler = async (req, res, next) => {
  try {
    // Prefer DB reload so role/status changes apply without waiting for JWT expiry.
    const user = await authService.getMe(req.user!.id);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/rbac-write-check — B1 exit probe: MD_VIEWER must get 403.
 * Protected by authenticate + requireWrite. Remove or lock down after B2 if unused.
 */
export const rbacWriteCheck: RequestHandler = (_req, res) => {
  res.json({
    data: {
      ok: true,
      message: "Write permitted for this role",
    },
  });
};

/** Exported for typing / tests — cookie names used by this module. */
export const authCookieNames = {
  access: ACCESS_COOKIE,
  refresh: REFRESH_COOKIE,
} as const;
