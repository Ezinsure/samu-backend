import pino from "pino";
import { env } from "../config/env.js";

/** Shared structured logger for request logs and domain services. */
export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino/file", options: { destination: 1 } }
      : undefined,
});
