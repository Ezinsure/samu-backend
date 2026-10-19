import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  onboardingIdParamSchema,
  onboardingInputSchema,
  onboardingListQuerySchema,
} from "./onboarding.schemas.js";
import * as onboardingService from "./onboarding.service.js";

/**
 * GET /api/v1/onboarding — paginated cases.
 */
export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = onboardingListQuerySchema.parse(req.query);
    const result = await onboardingService.listOnboarding(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/onboarding/:id — single case.
 */
export const getById: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = onboardingIdParamSchema.parse(req.params);
    const onboarding = await onboardingService.getOnboardingById(id, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: { onboarding } });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/onboarding — create (Admin / Ops / TC).
 */
export const create: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = onboardingInputSchema.parse(req.body);
    const onboarding = await onboardingService.createOnboarding(body, req.user);
    res.status(201).json({ data: { onboarding } });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/onboarding/:id — update (Admin / Ops / owning TC).
 */
export const update: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const { id } = onboardingIdParamSchema.parse(req.params);
    const body = onboardingInputSchema.parse(req.body);
    const onboarding = await onboardingService.updateOnboarding(
      id,
      body,
      req.user,
    );
    res.json({ data: { onboarding } });
  } catch (error) {
    next(error);
  }
};
