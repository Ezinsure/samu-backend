import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  saleIdParamSchema,
  saleInputSchema,
  saleListQuerySchema,
} from "./sales.schemas.js";
import * as salesService from "./sales.service.js";

/**
 * GET /api/v1/sales — paginated list.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = saleListQuerySchema.parse(req.query);
    const result = await salesService.listSales(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/sales/:id — single sale.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = saleIdParamSchema.parse(req.params);
    const sale = await salesService.getSaleById(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { sale } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/sales — create (Admin / Ops / TC).
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = saleInputSchema.parse(req.body);
    const sale = await salesService.createSale(body, req.user);
    res.status(201).json({ data: { sale } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/sales/:id — update (Admin / Ops / owning TC).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = saleIdParamSchema.parse(req.params);
    const body = saleInputSchema.parse(req.body);
    const sale = await salesService.updateSale(id, body, req.user);
    res.json({ data: { sale } });
  } catch (error) {
    next(error);
  }
};
