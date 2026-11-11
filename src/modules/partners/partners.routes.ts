import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import {
  applicantsSummaryQuerySchema,
  listApplicantsQuerySchema,
  startVerificationRunSchema,
} from "./partners.schemas.js";
import * as service from "./partners.service.js";
import * as verification from "./partner-verification.service.js";

export const partnersRouter = Router();

partnersRouter.use(authenticate, requireRoles("ADMIN"));

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many verification runs. Try again later.",
      details: [],
    },
  },
});

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

/** Contract snapshot for admins + partner onboarding (payload/response examples). */
partnersRouter.get("/ezinsure/verify-contract", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = verification.getVerifyContract(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

partnersRouter.post(
  "/applicants/verify",
  verifyLimiter,
  requireWrite,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const input = startVerificationRunSchema.parse(req.body ?? {});
      const data = await verification.startVerificationRun(req.user, input);
      res.status(202).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

partnersRouter.get("/verification-runs", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const partnerKey =
      typeof req.query.partnerKey === "string"
        ? req.query.partnerKey
        : undefined;
    const limit =
      typeof req.query.limit === "string"
        ? Number(req.query.limit)
        : undefined;
    const data = await verification.listVerificationRuns(req.user, {
      partnerKey,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

partnersRouter.get("/verification-runs/:id", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await verification.getVerificationRun(req.user, req.params.id);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});
