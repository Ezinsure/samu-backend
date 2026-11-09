import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { env } from "../config/env.js";

/**
 * Central error formatter — keeps controllers thin and responses consistent
 * with DOCs/SAMU-API-Conventions.md.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details ?? [],
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
    return;
  }

  // Multer rejects (size / MIME) before controllers run.
  const multerCode =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: string }).code ?? "")
      : "";
  if (multerCode === "LIMIT_FILE_SIZE") {
    res.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: "Uploaded file exceeds the allowed size limit",
        details: [],
      },
    });
    return;
  }
  if (
    err instanceof Error &&
    /only pdf or image|file type|mimetype/i.test(err.message)
  ) {
    res.status(400).json({
      error: {
        code: "BAD_REQUEST",
        message: err.message,
        details: [],
      },
    });
    return;
  }

  logger.error({ err }, "Unhandled error");

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err instanceof Error
            ? err.message
            : "Unknown error",
      details: [],
    },
  });
};
