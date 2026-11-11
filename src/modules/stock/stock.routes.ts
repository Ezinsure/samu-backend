import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import {
  createStockTypeSchema,
  intakeUnitsSchema,
  listUnitsQuerySchema,
  previewIntakeSchema,
  updateStockTypeSchema,
} from "./stock.schemas.js";
import * as service from "./stock.service.js";

export const stockRouter = Router();

stockRouter.use(authenticate, requireRoles("ADMIN"));

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many inventory writes. Try again later.",
      details: [],
    },
  },
});

function meta(req: { ip?: string; get: (h: string) => string | undefined }) {
  return { ip: req.ip, userAgent: req.get("user-agent") ?? undefined };
}

stockRouter.get("/overview", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await service.getOverview(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/types", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const includeDisabled = req.query.includeDisabled === "true";
    const data = await service.listTypes(req.user, { includeDisabled });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.post("/types", requireWrite, writeLimiter, async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = createStockTypeSchema.parse(req.body);
    const data = await service.createType(body, req.user, meta(req));
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.patch(
  "/types/:key",
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = updateStockTypeSchema.parse(req.body);
      const data = await service.updateType(
        String(req.params.key),
        body,
        req.user,
        meta(req),
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.get("/units", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = listUnitsQuerySchema.parse(req.query);
    const data = await service.listUnits(query, req.user);
    res.json({
      data: data.data,
      meta: {
        page: data.page,
        pageSize: data.pageSize,
        total: data.total,
        totalPages: data.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/units/:id", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await service.getUnit(String(req.params.id), req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.post(
  "/intake/preview",
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = previewIntakeSchema.parse(req.body);
      const data = await service.previewIntake(body, req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.post("/intake", requireWrite, writeLimiter, async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = intakeUnitsSchema.parse(req.body);
    const data = await service.intakeUnits(body, req.user, meta(req));
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});
