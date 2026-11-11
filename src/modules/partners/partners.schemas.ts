import { z } from "zod";

export const PARTNER_EZINSURE = "ezinsure" as const;

export const partnerVerificationStatusSchema = z.enum([
  "unverified",
  "verified",
  "not_found",
  "error",
]);

export const listApplicantsQuerySchema = z.object({
  partnerKey: z.string().trim().min(1).max(40).default(PARTNER_EZINSURE),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  coaUserId: z.string().trim().min(1).optional(),
  verificationStatus: partnerVerificationStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type ListApplicantsQuery = z.infer<typeof listApplicantsQuerySchema>;

export const applicantsSummaryQuerySchema = z.object({
  partnerKey: z.string().trim().min(1).max(40).default(PARTNER_EZINSURE),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

export type ApplicantsSummaryQuery = z.infer<
  typeof applicantsSummaryQuerySchema
>;
