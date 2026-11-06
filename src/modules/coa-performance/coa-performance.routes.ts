import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import { createPerformanceEntrySchema } from "./coa-performance.schemas.js";
import * as service from "./coa-performance.service.js";

export const coaPerformanceRouter = Router();

coaPerformanceRouter.use(authenticate);

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many performance writes. Try again later.",
      details: [],
    },
  },
});

const ACTORS = ["ADMIN", "COMMUNITY_OPPORTUNITY_ASSOCIATE"] as const;

coaPerformanceRouter.get(
  "/me",
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const data = await service.getMyProgress(req.user, month);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.get(
  "/entries",
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const metricKey =
        typeof req.query.metricKey === "string"
          ? req.query.metricKey
          : undefined;
      const result = await service.listMyEntries(req.user, {
        month,
        metricKey,
      });
      res.json({ data: result.data, meta: { month: result.month } });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.post(
  "/entries",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = createPerformanceEntrySchema.parse(req.body);
      const data = await service.createEntry(body, req.user);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.delete(
  "/entries/:id",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.deleteEntry(String(req.params.id), req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.delete(
  "/clients/:id",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.deleteClientRow(
        String(req.params.id),
        req.user,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
