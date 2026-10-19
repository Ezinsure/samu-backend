import { z } from "zod";
import { leadGeoSchema, serviceLineSchema } from "../leads/leads.schemas.js";

export const feedbackKindSchema = z.enum(["need", "challenge", "opportunity"]);
export const feedbackSeveritySchema = z.enum(["low", "medium", "high"]);
export const feedbackStatusSchema = z.enum(["open", "acknowledged", "resolved"]);

export const feedbackInputSchema = z.object({
  serviceLine: serviceLineSchema.optional(),
  kind: feedbackKindSchema,
  severity: feedbackSeveritySchema,
  status: feedbackStatusSchema,
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(4000),
  geo: leadGeoSchema,
  leadId: z.string().min(1).optional(),
  resolutionNotes: z.string().trim().max(2000).optional(),
  /** Required for Admin/Ops create; ignored for TC (forced to self). */
  tcUserId: z.string().min(1).optional(),
});

export const feedbackListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  serviceLine: serviceLineSchema.optional(),
  kind: feedbackKindSchema.optional(),
  status: feedbackStatusSchema.optional(),
  tcUserId: z.string().min(1).optional(),
});

export const feedbackIdParamSchema = z.object({
  id: z.string().min(1),
});

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;
export type FeedbackListQuery = z.infer<typeof feedbackListQuerySchema>;
