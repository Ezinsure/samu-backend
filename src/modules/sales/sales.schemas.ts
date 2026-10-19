import { z } from "zod";
import { leadGeoSchema, serviceLineSchema } from "../leads/leads.schemas.js";

export const saleProductCategorySchema = z.enum([
  "internet_4g",
  "internet_starlink",
  "smartphone",
  "induction_cooker",
  "insurance_policy",
  "other",
]);

export const saleInputSchema = z.object({
  serviceLine: serviceLineSchema,
  productCategory: saleProductCategorySchema,
  productName: z.string().trim().min(2).max(200),
  quantity: z.number().int().min(1).max(10_000),
  amountRwf: z.number().int().min(0),
  customerName: z.string().trim().min(2).max(160),
  customerPhone: z.string().trim().min(7).max(32),
  geo: leadGeoSchema,
  soldAt: z
    .string()
    .min(10)
    .refine((v) => !Number.isNaN(Date.parse(v)), "soldAt must be a valid ISO date"),
  leadId: z.string().min(1).optional(),
  onboardingId: z.string().min(1).optional(),
  depositRwf: z.number().int().min(0).optional(),
  installmentMonths: z.number().int().min(1).max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  /** Required for Admin/Ops create; ignored for TC (forced to self). */
  tcUserId: z.string().min(1).optional(),
});

export const saleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  serviceLine: serviceLineSchema.optional(),
  tcUserId: z.string().min(1).optional(),
});

export const saleIdParamSchema = z.object({
  id: z.string().min(1),
});

export type SaleInput = z.infer<typeof saleInputSchema>;
export type SaleListQuery = z.infer<typeof saleListQuerySchema>;
