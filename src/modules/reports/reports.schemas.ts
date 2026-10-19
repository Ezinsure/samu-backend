import { z } from "zod";

export const reportStatusSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "resubmitted",
  "reviewed",
  "evaluated",
]);

export const narrativeSchema = z.object({
  g1: z.string().max(4000),
  g2: z.string().max(4000),
  g3: z.string().max(4000),
  g4: z.string().max(4000),
  g5: z.string().max(4000),
  g6: z.string().max(4000),
  g7: z.string().max(4000),
});

export const reportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: reportStatusSchema.optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM")
    .optional(),
  tcUserId: z.string().min(1).optional(),
});

export const reportIdParamSchema = z.object({
  id: z.string().min(1),
});

export const reportCreateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  /** Required for Admin/Ops; TCs always create for self. */
  tcUserId: z.string().min(1).optional(),
});

export const reportDraftSchema = z.object({
  narrative: narrativeSchema,
  kpiActuals: z.record(z.string(), z.number()).optional(),
});

export const requestChangesSchema = z.object({
  notes: z.string().trim().min(1).max(2000),
});

export type ReportListQuery = z.infer<typeof reportListQuerySchema>;
export type ReportCreateInput = z.infer<typeof reportCreateSchema>;
export type ReportDraftInput = z.infer<typeof reportDraftSchema>;
