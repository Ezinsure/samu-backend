import { z } from "zod";

export const serviceLineSchema = z.enum([
  "irembo",
  "bk",
  "internet",
  "device_financing",
  "insurance",
  "clean_cooking",
]);

export const leadStatusSchema = z.enum([
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
]);

export const leadEntityTypeSchema = z.enum(["person", "household", "business"]);

export const leadGeoSchema = z.object({
  province: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(120),
});

export const leadInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(7).max(32),
  entityType: leadEntityTypeSchema,
  serviceLine: serviceLineSchema,
  status: leadStatusSchema,
  geo: leadGeoSchema,
  notes: z.string().trim().max(2000).optional(),
  interestSummary: z.string().trim().max(500).optional(),
  /** Required for Admin/Ops create; ignored for TC (forced to self). */
  tcUserId: z.string().min(1).optional(),
});

export const leadListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  serviceLine: serviceLineSchema.optional(),
  status: leadStatusSchema.optional(),
  tcUserId: z.string().min(1).optional(),
});

export const leadIdParamSchema = z.object({
  id: z.string().min(1),
});

export type LeadInput = z.infer<typeof leadInputSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
