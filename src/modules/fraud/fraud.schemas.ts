import { z } from "zod";

export const fraudStatusSchema = z.enum([
  "open",
  "escalated",
  "resolved",
  "dismissed",
]);

export const fraudSeveritySchema = z.enum(["low", "medium", "high"]);

export const fraudReviewActionSchema = z.enum(["accept", "escalate", "dismiss"]);

export const fraudListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: fraudStatusSchema.optional(),
  severity: fraudSeveritySchema.optional(),
  type: z.string().trim().max(120).optional(),
});

export const fraudIdParamSchema = z.object({
  id: z.string().min(1),
});

export const fraudReviewSchema = z.object({
  action: fraudReviewActionSchema,
  notes: z.string().trim().min(1).max(2000),
});

export type FraudListQuery = z.infer<typeof fraudListQuerySchema>;
export type FraudReviewInput = z.infer<typeof fraudReviewSchema>;
