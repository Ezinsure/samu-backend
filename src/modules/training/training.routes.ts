import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./training.service.js";

export const trainingRouter = Router();
trainingRouter.use(authenticate);

trainingRouter.post(
  "/attendance/upload",
  requireWrite,
  requireRoles("ADMIN"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = service.attendanceUploadSchema.parse(req.body);
      const data = await service.uploadAttendance(body, req.user);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  },
);

trainingRouter.get(
  "/attendance/gaps",
  requireRoles("ADMIN", "TERRITORY_COORDINATOR"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const sessionId =
        typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
      const data = await service.attendanceGaps(req.user, sessionId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

trainingRouter.patch(
  "/attendance/:id/follow-up",
  requireWrite,
  requireRoles("ADMIN", "TERRITORY_COORDINATOR"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const body = z.object({ note: z.string().trim().max(2000) }).parse(req.body);
      const data = await service.setFollowUpNote(
        String(req.params.id),
        body.note,
        req.user,
      );
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);
