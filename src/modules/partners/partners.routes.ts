import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import {
  applicantsSummaryQuerySchema,
  listApplicantsQuerySchema,
} from "./partners.schemas.js";
import * as service from "./partners.service.js";

export const partnersRouter = Router();

partnersRouter.use(authenticate, requireRoles("ADMIN"));

partnersRouter.get("/applicants", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = listApplicantsQuerySchema.parse(req.query);
    const data = await service.listApplicants(req.user, query);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

partnersRouter.get("/applicants/export.csv", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = listApplicantsQuerySchema.parse({
      ...req.query,
      limit: 10_000,
      offset: 0,
    });
    const file = await service.exportApplicantsCsv(req.user, query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.filename}"`,
    );
    res.send(file.csv);
  } catch (error) {
    next(error);
  }
});

partnersRouter.get("/applicants/summary", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = applicantsSummaryQuerySchema.parse(req.query);
    const data = await service.getApplicantsSummary(req.user, query);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});
