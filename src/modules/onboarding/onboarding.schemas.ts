import { z } from "zod";
import { leadGeoSchema, serviceLineSchema } from "../leads/leads.schemas.js";

export const onboardingKindSchema = z.enum([
  "customer",
  "irembo_agent",
  "insurance_agent",
  "bk_account",
  "internet_activation",
  "device_registration",
  "cooker_purchase",
]);

export const onboardingStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "pending_partner",
  "completed",
  "cancelled",
]);

export const onboardingInputSchema = z.object({
  serviceLine: serviceLineSchema,
  kind: onboardingKindSchema,
  status: onboardingStatusSchema,
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.string().trim().min(7).max(32),
  geo: leadGeoSchema,
  stageLabel: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(2000).optional(),
  leadId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  /** Required for Admin/Ops create; ignored for TC (forced to self). */
  tcUserId: z.string().min(1).optional(),
});

export const onboardingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  serviceLine: serviceLineSchema.optional(),
  status: onboardingStatusSchema.optional(),
  tcUserId: z.string().min(1).optional(),
});

export const onboardingIdParamSchema = z.object({
  id: z.string().min(1),
});

export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type OnboardingListQuery = z.infer<typeof onboardingListQuerySchema>;
