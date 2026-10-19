import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { agentsRouter } from "./modules/agents/agents.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { leadsRouter } from "./modules/leads/leads.routes.js";
import { territoriesRouter } from "./modules/territories/territories.routes.js";

/**
 * Builds the Express application (no listen).
 * Separating app construction from listen enables testing with supertest later.
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: env.NODE_ENV !== "test",
    }),
  );

  // Unversioned ops probe
  app.use("/health", healthRouter);

  // Versioned API surface — feature routers mount here from Phase B1 onward.
  const api = express.Router();
  api.get("/", (_req, res) => {
    res.json({
      data: {
        name: "SAMU API",
        version: "v1",
        docs: "See DOCs/SAMU-API-Conventions.md",
      },
    });
  });
  api.use("/auth", authRouter);
  api.use("/territories", territoriesRouter);
  api.use("/agents", agentsRouter);
  api.use("/leads", leadsRouter);
  app.use("/api/v1", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
