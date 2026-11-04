import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRoles, requireWrite } from "../../middleware/rbac.js";
import { errors } from "../../lib/errors.js";
import * as service from "./invite-links.service.js";

export const inviteLinksRouter = Router();

inviteLinksRouter.use(authenticate);

inviteLinksRouter.get(
  "/me",
  requireRoles("ADMIN", "TERRITORY_COORDINATOR", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.getOrCreateInviteLink(req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

inviteLinksRouter.post(
  "/me",
  requireWrite,
  requireRoles("ADMIN", "TERRITORY_COORDINATOR", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const data = await service.getOrCreateInviteLink(req.user);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  },
);

inviteLinksRouter.get(
  "/pending-reviews",
  requireRoles("ADMIN", "TERRITORY_COORDINATOR", "COMMUNITY_OPPORTUNITY_ASSOCIATE"),
  async (req, res, next) => {
    try {
      if (!req.user) throw errors.unauthorized();
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const result = await service.listPendingReviews(req.user, {
        page,
        pageSize,
      });
      res.json({
        data: result.data,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
