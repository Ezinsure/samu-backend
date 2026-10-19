import type { RequestHandler } from "express";
import { getHealthStatus } from "./health.service.js";

/**
 * GET /health — liveness + DB check (unauthenticated).
 * Returns 200 when DB is up, 503 when degraded so load balancers can react.
 */
export const getHealth: RequestHandler = async (_req, res, next) => {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === "ok" ? 200 : 503;
    res.status(statusCode).json({ data: health });
  } catch (error) {
    next(error);
  }
};
