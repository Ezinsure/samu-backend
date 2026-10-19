import type { RequestHandler } from "express";
import { errors } from "../../lib/errors.js";
import {
  messageListQuerySchema,
  sendSmsSchema,
} from "./messaging.schemas.js";
import * as messagingService from "./messaging.service.js";

export const status: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const data = await messagingService.getMessagingStatus(req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

export const list: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const query = messageListQuerySchema.parse(req.query);
    const result = await messagingService.listMessages(query, req.user);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ data: result.data, meta: result.meta });
  } catch (error) {
    next(error);
  }
};

export const sendSms: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw errors.unauthorized();
    const body = sendSmsSchema.parse(req.body);
    const message = await messagingService.sendSms(body, req.user, {
      ip: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.status(201).json({ data: { message } });
  } catch (error) {
    next(error);
  }
};
