import type { CookieOptions, Response } from "express";
import { env } from "../config/env.js";
import { ttlToMs } from "./tokens.js";

export const ACCESS_COOKIE = "samu_access";
export const REFRESH_COOKIE = "samu_refresh";

/**
 * Shared cookie flags for auth tokens (HttpOnly + SameSite; Secure in production).
 */
function baseCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

/** Set access + refresh httpOnly cookies on the response. */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, baseCookieOptions(ttlToMs(env.JWT_ACCESS_TTL)));
  res.cookie(
    REFRESH_COOKIE,
    refreshToken,
    baseCookieOptions(ttlToMs(env.JWT_REFRESH_TTL)),
  );
}

/** Clear both auth cookies (logout / failed refresh). */
export function clearAuthCookies(res: Response): void {
  const clearOpts: CookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  res.clearCookie(ACCESS_COOKIE, clearOpts);
  res.clearCookie(REFRESH_COOKIE, clearOpts);
}
