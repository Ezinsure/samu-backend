import type { RequestHandler } from "express";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  setAuthCookies,
} from "../../lib/cookies.js";
import { errors } from "../../lib/errors.js";
import {
  changePasswordBodySchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  updateProfileBodySchema,
} from "./auth.schemas.js";
import * as accountService from "./auth.account.service.js";
import * as authService from "./auth.service.js";
import * as passwordReset from "./password-reset.service.js";

/** Request metadata recorded on audit rows. */
function requestMeta(req: Parameters<RequestHandler>[0]) {
  return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined };
}

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
 * PATCH /api/v1/auth/me — edit own profile fields.
 */
export const updateMe: RequestHandler = async (req, res, next) => {
  try {
    const body = updateProfileBodySchema.parse(req.body);
    const user = await accountService.updateOwnProfile(
      req.user!.id,
      body,
      requestMeta(req),
    );
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/** POST /api/v1/auth/me/avatar — upload profile photo (multipart `file`). */
export const uploadAvatar: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const file = req.file;
    if (!file) throw errors.badRequest("Attach an image as field `file`");
    const user = await accountService.uploadOwnAvatar(
      req.user.id,
      {
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname || "avatar.jpg",
        size: file.size,
      },
      requestMeta(req),
    );
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/v1/auth/me/avatar — remove profile photo. */
export const removeAvatar: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const user = await accountService.removeOwnAvatar(
      req.user.id,
      requestMeta(req),
    );
    res.json({ data: { user } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/change-password — verify current password, revoke other
 * sessions, and rotate cookies for this device.
 */
export const changePassword: RequestHandler = async (req, res, next) => {
  try {
    const body = changePasswordBodySchema.parse(req.body);
    const session = await accountService.changeOwnPassword(
      req.user!.id,
      body,
      requestMeta(req),
    );
    setAuthCookies(res, session.accessToken, session.refreshToken);
    res.json({ data: { user: session.user } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/forgot-password — always 200 so account existence is not leaked.
 */
export const forgotPassword: RequestHandler = async (req, res, next) => {
  try {
    const body = forgotPasswordBodySchema.parse(req.body);
    await passwordReset.requestPasswordReset(body, requestMeta(req));
    res.json({
      data: {
        ok: true,
        message: "If an account exists for that email, a reset link has been sent.",
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/reset-password — consume an emailed token and set a new password.
 */
export const resetPassword: RequestHandler = async (req, res, next) => {
  try {
    const body = resetPasswordBodySchema.parse(req.body);
    await passwordReset.resetPassword(body, requestMeta(req));
    res.json({ data: { ok: true } });
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
