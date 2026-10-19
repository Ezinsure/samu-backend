import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import { serviceLineParamSchema } from "./coap.schemas.js";
import * as coapService from "./coap.service.js";

/**
 * GET /api/v1/coap/services — hub summaries for all service lines.
 */
export const listServices: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await coapService.getServicesWorkspace(req.user);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/coap/services/:line/workspace — single-line cockpit payload.
 */
export const serviceWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { line } = serviceLineParamSchema.parse(req.params);
    const data = await coapService.getServiceLineWorkspace(line, req.user);
    res.setHeader("Cache-Control", "private, max-age=30");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};
