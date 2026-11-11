import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import {
  createAssignmentSchema,
  createStockTypeSchema,
  declineTransferSchema,
  intakeUnitsSchema,
  listTransfersQuerySchema,
  listUnitsQuerySchema,
  previewIntakeSchema,
  respondTransferSchema,
  updateStockTypeSchema,
} from "./stock.schemas.js";
import * as service from "./stock.service.js";
import * as transfers from "./stock-transfers.service.js";

export const stockRouter = Router();

stockRouter.use(
  authenticate,
  requireRoles(
    "ADMIN",
    "TERRITORY_COORDINATOR",
    "COMMUNITY_OPPORTUNITY_ASSOCIATE",
  ),
);

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

const adminOnly = requireRoles("ADMIN");

stockRouter.get("/overview", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data =
      req.user.role === "ADMIN"
        ? await service.getOverview(req.user)
        : await service.getMyStockOverview(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/mine/overview", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await service.getMyStockOverview(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/holders/breakdown", adminOnly, async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await transfers.getHolderBreakdown(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/holders", adminOnly, async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await transfers.listAssignableHolders(req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.get("/types", adminOnly, async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const includeDisabled = req.query.includeDisabled === "true";
    const data = await service.listTypes(req.user, { includeDisabled });
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.post(
  "/types",
  adminOnly,
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = createStockTypeSchema.parse(req.body);
      const data = await service.createType(body, req.user, meta(req));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.patch(
  "/types/:key",
  adminOnly,
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
  adminOnly,
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

stockRouter.post(
  "/intake",
  adminOnly,
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = intakeUnitsSchema.parse(req.body);
      const data = await service.intakeUnits(body, req.user, meta(req));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.post(
  "/transfers/assignments",
  adminOnly,
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = createAssignmentSchema.parse(req.body);
      const data = await transfers.createAssignment(body, req.user, meta(req));
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.get("/transfers", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = listTransfersQuerySchema.parse(req.query);
    const data = await transfers.listTransfers(query, req.user);
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

stockRouter.get("/transfers/:id", async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await transfers.getTransfer(String(req.params.id), req.user);
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

stockRouter.post(
  "/transfers/:id/accept",
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await transfers.acceptAllTransfer(
        String(req.params.id),
        req.user,
        meta(req),
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

stockRouter.post(
  "/transfers/:id/decline",
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = declineTransferSchema.parse(req.body ?? {});
      const data = await transfers.declineTransfer(
        String(req.params.id),
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

stockRouter.post(
  "/transfers/:id/respond",
  requireWrite,
  writeLimiter,
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = respondTransferSchema.parse(req.body);
      const data = await transfers.respondToTransfer(
        String(req.params.id),
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
