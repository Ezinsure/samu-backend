import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  scorecardDraftSchema,
  scorecardEnsureSchema,
  scorecardIdParamSchema,
  scorecardListQuerySchema,
} from "./scorecards.schemas.js";
import * as scorecardsService from "./scorecards.service.js";

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = scorecardListQuerySchema.parse(req.query);
    const result = await scorecardsService.listScorecards(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

export const getWorkspace: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = scorecardIdParamSchema.parse(req.params);
    const data = await scorecardsService.getWorkspace(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const ensure: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = scorecardEnsureSchema.parse(req.body);
    const result = await scorecardsService.ensureForReport(
      body.monthlyReportId,
      req.user,
    );
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const saveDraft: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = scorecardIdParamSchema.parse(req.params);
    const body = scorecardDraftSchema.parse(req.body);
    const scorecard = await scorecardsService.saveDraft(id, body, req.user);
    res.json({ data: { scorecard } });
  } catch (error) {
    next(error);
  }
};

export const submit: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = scorecardIdParamSchema.parse(req.params);
    const scorecard = await scorecardsService.submitScorecard(id, req.user);
    res.json({ data: { scorecard } });
  } catch (error) {
    next(error);
  }
};
