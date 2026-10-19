import { Router } from "express";
import { getHealth } from "./health.controller.js";

export const healthRouter = Router();

// Public probe — no auth middleware by design.
healthRouter.get("/", getHealth);
