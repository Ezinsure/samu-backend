import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import {
  createPerformanceEntrySchema,
  monthSchema,
} from "./coa-performance.schemas.js";
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

const ALLOWED_UPLOAD_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF or image files (JPEG, PNG, WebP) are allowed"));
  },
});

const ACTORS = ["ADMIN", "COMMUNITY_OPPORTUNITY_ASSOCIATE"] as const;
const FILE_VIEWERS = [
  "ADMIN",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
] as const;

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
  "/admin/report",
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const data = await service.getAdminMonthReport(req.user, month);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.get(
  "/admin/report.csv",
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const report = await service.getAdminMonthReport(req.user, month);
      const csv = service.adminReportToCsv(report);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="coa-performance-${report.month}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.get(
  "/admin/coas/:coaUserId",
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const month =
        typeof req.query.month === "string" ? req.query.month : undefined;
      const data = await service.getAdminCoaDetail(
        req.user,
        String(req.params.coaUserId),
        month,
      );
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
      const monthFrom =
        typeof req.query.monthFrom === "string"
          ? req.query.monthFrom
          : undefined;
      const monthTo =
        typeof req.query.monthTo === "string" ? req.query.monthTo : undefined;
      const metricKey =
        typeof req.query.metricKey === "string"
          ? req.query.metricKey
          : undefined;
      const result = await service.listMyEntries(req.user, {
        month,
        monthFrom,
        monthTo,
        metricKey,
      });
      res.json({
        data: result.data,
        meta: {
          month: result.month,
          monthFrom: result.monthFrom,
          monthTo: result.monthTo,
        },
      });
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

coaPerformanceRouter.post(
  "/gps-photos",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const file = req.file;
      if (!file) throw errors.badRequest("file is required");
      const data = await service.uploadGpsPhoto(
        {
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        },
        req.user,
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.get(
  "/clients/:id/gps-photo",
  requireRoles(...FILE_VIEWERS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.getGpsPhotoViewUrl(
        String(req.params.id),
        req.user,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.post(
  "/evidence-files",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const file = req.file;
      if (!file) throw errors.badRequest("file is required");
      const fields = z
        .object({
          metricKey: z.string().trim().min(2).max(80),
          month: monthSchema,
          notes: z.string().trim().max(2000).optional(),
        })
        .parse(req.body);
      const data = await service.attachEvidenceFile(
        {
          metricKey: fields.metricKey,
          month: fields.month,
          notes: fields.notes,
          file: {
            buffer: file.buffer,
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          },
        },
        req.user,
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

coaPerformanceRouter.get(
  "/files/:id/url",
  requireRoles(...FILE_VIEWERS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.getEvidenceFileViewUrl(
        String(req.params.id),
        req.user,
      );
      res.json({ data });
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

coaPerformanceRouter.delete(
  "/files/:id",
  writeLimiter,
  requireWrite,
  requireRoles(...ACTORS),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.deleteEvidenceFile(
        String(req.params.id),
        req.user,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
