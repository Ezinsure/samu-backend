import { z } from "zod";
import { serviceLineSchema } from "../../lib/service-lines.js";

export const VISIT_PURPOSES = [
  "Ezinsure Support",
  "Performance Review",
  "Problem Solving",
  "COAP Education",
  "COAP Onboarding Support",
  "COAP Sales Follow-up",
  "Community Feedback",
] as const;

export const visitPurposeSchema = z.enum(VISIT_PURPOSES);

export const visitValidationSchema = z.enum(["accepted", "flagged", "rejected"]);

export const confirmationStatusSchema = z.enum([
  "pending",
  "confirmed",
  "disputed",
  "expired",
  "delivery_failed",
]);

/** Matches frontend AgentServices / agents.mapper AgentServices. */
export const agentServicesSchema = z.object({
  iremboTools: z.boolean(),
  insuranceTools: z.boolean(),
  telecomTools: z.boolean(),
  bkTools: z.boolean(),
  smartphone: z.boolean(),
  printer: z.boolean(),
  internetAvailable: z.boolean(),
  internetType: z.string().trim().max(80).optional(),
  brandingVisible: z.boolean(),
  trainedOnServices: z.boolean(),
  activelySelling: z.boolean(),
  cleanCookingTools: z.boolean().optional(),
  starlinkReady: z.boolean().optional(),
});

export const visitPhotoRefSchema = z.object({
  storageKey: z.string().min(1).max(512),
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive().max(15_000_000),
});

export const visitCreateSchema = z.object({
  agentId: z.string().min(1),
  purpose: visitPurposeSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyMeters: z.number().positive().max(10_000).optional(),
  }),
  activities: z.string().trim().min(1).max(4000),
  outcome: z.string().trim().min(1).max(4000),
  challenges: z.string().trim().max(2000).optional(),
  supportNeeded: z.string().trim().max(2000).optional(),
  checklist: agentServicesSchema,
  photos: z.array(visitPhotoRefSchema).min(1).max(10),
  deviceInfo: z.string().trim().max(500).optional(),
  serviceLines: z.array(serviceLineSchema).max(6).optional(),
});

export const visitListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  tcUserId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  validation: visitValidationSchema.optional(),
  confirmation: confirmationStatusSchema.optional(),
  purpose: visitPurposeSchema.optional(),
});

export const visitIdParamSchema = z.object({
  id: z.string().min(1),
});

export const visitPatchSchema = z.object({
  confirmationStatus: confirmationStatusSchema.optional(),
  validation: visitValidationSchema.optional(),
  flaggedReason: z.string().trim().max(500).optional(),
  challenges: z.string().trim().max(2000).optional(),
  supportNeeded: z.string().trim().max(2000).optional(),
});

export type VisitCreateInput = z.infer<typeof visitCreateSchema>;
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;
export type VisitPatchInput = z.infer<typeof visitPatchSchema>;
