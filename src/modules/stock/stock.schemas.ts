import { z } from "zod";

export const stockUnitStatusSchema = z.enum([
  "in_warehouse",
  "in_transit",
  "with_holder",
  "sold",
  "returned_by_customer",
  "damaged",
  "written_off",
]);

export const createStockTypeSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9_]*$/, "Key must be snake_case letters/numbers"),
  label: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});

export const updateStockTypeSchema = z
  .object({
    label: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });

const serialSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .transform((v) => v.toUpperCase().replace(/\s+/g, ""));

export const intakeUnitsSchema = z.object({
  typeKey: z.string().trim().min(2).max(60),
  serials: z.array(serialSchema).min(1).max(500),
  condition: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const previewIntakeSchema = z.object({
  typeKey: z.string().trim().min(2).max(60),
  serials: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
});

export const listUnitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  typeKey: z.string().trim().max(60).optional(),
  status: stockUnitStatusSchema.optional(),
  holderUserId: z.string().trim().min(1).optional(),
});

export type CreateStockTypeInput = z.infer<typeof createStockTypeSchema>;
export type UpdateStockTypeInput = z.infer<typeof updateStockTypeSchema>;
export type IntakeUnitsInput = z.infer<typeof intakeUnitsSchema>;
export type PreviewIntakeInput = z.infer<typeof previewIntakeSchema>;
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
