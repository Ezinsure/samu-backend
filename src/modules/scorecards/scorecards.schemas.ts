import { z } from "zod";

export const scorecardStatusSchema = z.enum(["draft", "submitted"]);

export const scorecardDecisionSchema = z.enum([
  "Outstanding",
  "Meets expectations",
  "Needs improvement",
  "Unsatisfactory",
]);

export const criterionScoreSchema = z.object({
  criterionId: z.string().min(1),
  score: z.number().min(1).max(5),
  comment: z.string().max(2000),
});

export const scorecardListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  status: scorecardStatusSchema.optional(),
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  tcUserId: z.string().min(1).optional(),
});

export const scorecardIdParamSchema = z.object({
  id: z.string().min(1),
});

export const scorecardEnsureSchema = z.object({
  monthlyReportId: z.string().min(1),
});

export const scorecardDraftSchema = z.object({
  criteria: z.array(criterionScoreSchema).min(1).max(20),
  overallComment: z.string().max(4000).optional(),
  decision: scorecardDecisionSchema.optional(),
});

export type ScorecardListQuery = z.infer<typeof scorecardListQuerySchema>;
export type ScorecardDraftInput = z.infer<typeof scorecardDraftSchema>;
