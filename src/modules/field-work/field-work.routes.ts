import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./field-work.service.js";

/** Legacy free-text COA activity log — read/report kept; create returns 410. */

export const fieldWorkRouter = Router();
fieldWorkRouter.use(authenticate);

fieldWorkRouter.get(
  "/",
  requireRoles("ADMIN", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.listMyFieldWork(req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

/** Deprecated: COA logging moves to /coa-performance (imihigo evidence). */
fieldWorkRouter.post(
  "/",
  requireWrite,
  requireRoles("ADMIN", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (_req, res) => {
    res.status(410).json({
      error: {
        code: "GONE",
        message:
          "Field work logging is retired. Use COA performance metrics instead.",
      },
    });
  },
);

fieldWorkRouter.get(
  "/coa-performance",
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const query = z
        .object({
          dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(req.query);
      const data = await service.coaPerformanceReport(query);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

fieldWorkRouter.get(
  "/coa-performance.csv",
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      const query = z
        .object({
          dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(req.query);
      const data = await service.coaPerformanceReport(query);
      const header = "name,email,activities,peopleReached\n";
      const lines = data.rows
        .map(
          (r) =>
            `"${r.name}","${r.email}",${r.activitiesCount},${r.peopleReached}`,
        )
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="coa-performance-${query.dateFrom}-${query.dateTo}.csv"`,
      );
      res.send(header + lines + "\n");
    } catch (error) {
      next(error);
    }
  },
);
