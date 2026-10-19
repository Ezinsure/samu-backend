import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  reportCreateSchema,
  reportDraftSchema,
  reportIdParamSchema,
  reportListQuerySchema,
  requestChangesSchema,
} from "./reports.schemas.js";
import * as reportsService from "./reports.service.js";

export const filters: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await reportsService.getFilterOptions(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = reportListQuerySchema.parse(req.query);
    const result = await reportsService.listReports(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

export const getWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = reportIdParamSchema.parse(req.params);
    const data = await reportsService.getWorkspace(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = reportCreateSchema.parse(req.body);
    const report = await reportsService.createReport(body, req.user);
    res.status(201).json({ data: { report } });
  } catch (error) {
    next(error);
  }
};

export const saveDraft: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = reportIdParamSchema.parse(req.params);
    const body = reportDraftSchema.parse(req.body);
    const report = await reportsService.saveDraft(id, body, req.user);
    res.json({ data: { report } });
  } catch (error) {
    next(error);
  }
};

export const refreshKpis: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = reportIdParamSchema.parse(req.params);
    const report = await reportsService.refreshKpis(id, req.user);
    res.json({ data: { report } });
  } catch (error) {
    next(error);
  }
};

export const submit: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = reportIdParamSchema.parse(req.params);
    const report = await reportsService.submitReport(id, req.user);
    res.json({ data: { report } });
  } catch (error) {
    next(error);
  }
};

export const requestChanges: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = reportIdParamSchema.parse(req.params);
    const body = requestChangesSchema.parse(req.body);
    const report = await reportsService.requestChanges(
      id,
      body.notes,
      req.user,
    );
    res.json({ data: { report } });
  } catch (error) {
    next(error);
  }
};
