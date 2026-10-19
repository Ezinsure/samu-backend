import { z } from "zod";
import { leadGeoSchema, serviceLineSchema } from "../leads/leads.schemas.js";

export const fieldActivityTypeSchema = z.enum([
  "education",
  "demo",
  "mobilization",
  "support",
  "campaign",
]);

/** Accepts YYYY-MM-DD activity dates. */
const activityDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const activityInputSchema = z.object({
  serviceLine: serviceLineSchema,
  activityType: fieldActivityTypeSchema,
  date: activityDateSchema,
  geo: leadGeoSchema,
  venue: z.string().trim().min(2).max(200),
  peopleReached: z.number().int().min(0).max(100_000),
  summary: z.string().trim().min(2).max(2000),
  outcome: z.string().trim().min(2).max(2000),
  leadId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  /** Required for Admin/Ops create; ignored for TC (forced to self). */
  tcUserId: z.string().min(1).optional(),
});

export const activityListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  serviceLine: serviceLineSchema.optional(),
  activityType: fieldActivityTypeSchema.optional(),
  tcUserId: z.string().min(1).optional(),
});

export const activityIdParamSchema = z.object({
  id: z.string().min(1),
});

export type ActivityInput = z.infer<typeof activityInputSchema>;
export type ActivityListQuery = z.infer<typeof activityListQuerySchema>;
