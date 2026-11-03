import { Router } from "express";
import rateLimit from "express-rate-limit";
import { rwandaGeoPayload } from "../../lib/rwanda-geo.js";
import { publicRegisterSchema } from "./public-network.schemas.js";
import * as service from "./public-network.service.js";

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

export const publicNetworkRouter = Router();

publicNetworkRouter.get("/geo/rwanda", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.json({ data: rwandaGeoPayload() });
});

publicNetworkRouter.post("/network-register", registerLimiter, async (req, res, next) => {
  try {
    const body = publicRegisterSchema.parse(req.body);
    const data = await service.registerFromPublicForm(body);
    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});
