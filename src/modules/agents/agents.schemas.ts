import { z } from "zod";
import {
  normalizeNidDigits,
  personNameSchema,
  rwandaMobileOptionalSchema,
  rwandaMobileSchema,
  safeShortText,
} from "../../lib/field-validation.js";

export const agentStatusSchema = z.enum([
  "Candidate",
  "InTraining",
  "ExamPending",
  "Certified",
  "Inactive",
]);

export const complianceSchema = z.enum(["green", "yellow", "red"]);

export const officeTypeSchema = z.enum(["kiosk", "room", "desk"]);

export const agentServicesSchema = z.object({
  iremboTools: z.boolean(),
  insuranceTools: z.boolean(),
  telecomTools: z.boolean(),
  bkTools: z.boolean(),
  smartphone: z.boolean(),
  printer: z.boolean(),
  internetAvailable: z.boolean(),
  internetType: z.string().max(80).optional(),
  brandingVisible: z.boolean(),
  trainedOnServices: z.boolean(),
  activelySelling: z.boolean(),
  cleanCookingTools: z.boolean().optional(),
  starlinkReady: z.boolean().optional(),
});

export const geoSchema = z.object({
  province: safeShortText(120, "Province").min(1),
  district: safeShortText(120, "District").min(1),
  sector: safeShortText(120, "Sector").min(1),
  cell: safeShortText(120, "Cell").min(1),
  village: safeShortText(120, "Village").optional(),
});

export const agentInputSchema = z.object({
  name: personNameSchema,
  phone: rwandaMobileSchema,
  email: z
    .union([z.string().email().max(320), z.literal("")])
    .optional(),
  code: z.string().trim().min(3).max(40).optional(),
  status: agentStatusSchema.default("Candidate"),
  geo: geoSchema,
  registeredLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  tcUserId: z.string().min(1).nullable().optional(),
  age: z.number().int().min(16).max(100).optional(),
  gender: safeShortText(40, "Gender").optional(),
  education: safeShortText(120, "Education").optional(),
  tin: safeShortText(40, "TIN").optional(),
  businessType: safeShortText(200, "Business type").optional(),
  venue: safeShortText(200, "Venue").optional(),
  emergencyContactName: z
    .union([personNameSchema, z.literal("")])
    .optional(),
  emergencyContactPhone: rwandaMobileOptionalSchema,
  criminalRecordBillId: safeShortText(80, "Bill ID").optional(),
  certificateStorageKey: z.string().trim().max(500).optional(),
  hasPrinterScanner: z.boolean().optional(),
  hasComputer: z.boolean().optional(),
  officeType: officeTypeSchema.optional(),
  building: safeShortText(200, "Building").optional(),
  services: agentServicesSchema.optional(),
  clientsRegistered: z.number().int().min(0).optional(),
  recruitedThisMonth: z.boolean().optional(),
  reactivatedThisMonth: z.boolean().optional(),
  nidVerified: z.boolean().optional(),
  /** Required on create (FE); optional on edit when left blank. */
  nidNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      return normalizeNidDigits(v);
    })
    .refine((v) => v === undefined || /^\d{16}$/.test(v), {
      message: "National ID must be exactly 16 digits",
    }),
});

export const agentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  province: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  status: agentStatusSchema.optional(),
  compliance: complianceSchema.optional(),
  tcUserId: z.string().min(1).optional(),
  unassigned: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  reviewStatus: z.enum(["pending_review", "accepted", "rejected"]).optional(),
  sortBy: z.enum(["name", "lastVisit", "status"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const agentIdParamSchema = z.object({
  id: z.string().min(1),
});

export const pipelineActionSchema = z.object({
  action: z.enum(["start_training", "record_exam", "certify"]),
  examScore: z.number().min(0).max(100).optional(),
  iremboAccountCreated: z.boolean().optional(),
});

export const reviewActionSchema = z.object({
  action: z.enum(["accept", "reject"]),
  notes: z.string().trim().max(2000).optional(),
});

export const assignTcSchema = z.object({
  tcUserId: z.string().min(1),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentListQuery = z.infer<typeof agentListQuerySchema>;
export type PipelineActionInput = z.infer<typeof pipelineActionSchema>;
