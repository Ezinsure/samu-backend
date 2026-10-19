import type { RequestHandler } from "express";
import { ACCESS_COOKIE } from "../lib/cookies.js";
import { errors } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../lib/tokens.js";

/**
 * Requires a valid `samu_access` cookie JWT and loads the active user onto `req.user`.
 * Pending/disabled accounts are rejected even if the token is still signed.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) {
      next(errors.unauthorized());
      return;
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      next(errors.unauthorized("Invalid or expired session"));
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        phone: true,
        avatarInitials: true,
        agentId: true,
        lastLoginAt: true,
      },
    });

    if (!user || user.status !== "active") {
      next(errors.unauthorized("Invalid or expired session"));
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
