import { z } from "zod";

export const updateCoaMetricSchema = z
  .object({
    label: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    adminNote: z.string().trim().max(2000).nullable().optional(),
    monthlyTarget: z.number().int().min(0).max(100000).optional(),
    enabled: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
  })
  .refine(
    (body) =>
      body.label !== undefined ||
      body.description !== undefined ||
      body.adminNote !== undefined ||
      body.monthlyTarget !== undefined ||
      body.enabled !== undefined ||
      body.sortOrder !== undefined,
    { message: "At least one field is required" },
  );

export type UpdateCoaMetricInput = z.infer<typeof updateCoaMetricSchema>;
