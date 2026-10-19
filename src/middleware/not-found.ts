import type { RequestHandler } from "express";

/** Catch-all for unmatched routes under the API. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
      details: [],
    },
  });
};
