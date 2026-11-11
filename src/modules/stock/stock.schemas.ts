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

export const createAssignmentSchema = z
  .object({
    toUserId: z.string().trim().min(1),
    unitIds: z.array(z.string().trim().min(1)).min(1).max(200).optional(),
    typeKey: z.string().trim().min(2).max(60).optional(),
    quantity: z.number().int().min(1).max(200).optional(),
    note: z.string().trim().max(2000).optional(),
    reasonCode: z.string().trim().max(80).optional(),
  })
  .superRefine((value, ctx) => {
    const hasUnits = Boolean(value.unitIds?.length);
    const hasQty = Boolean(value.typeKey && value.quantity);
    if (hasUnits === hasQty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either unitIds, or typeKey with quantity",
        path: ["unitIds"],
      });
    }
  });

export const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["pending", "accepted", "partially_accepted", "declined", "cancelled"])
    .optional(),
  kind: z.enum(["assignment", "return"]).optional(),
  toUserId: z.string().trim().min(1).optional(),
  mine: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export const transferItemDecisionSchema = z.enum([
  "accepted",
  "missing",
  "wrong",
  "declined",
]);

export const respondTransferSchema = z.object({
  decisions: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        decision: transferItemDecisionSchema,
        note: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
  note: z.string().trim().max(2000).optional(),
});

export const declineTransferSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

export type CreateStockTypeInput = z.infer<typeof createStockTypeSchema>;
export type UpdateStockTypeInput = z.infer<typeof updateStockTypeSchema>;
export type IntakeUnitsInput = z.infer<typeof intakeUnitsSchema>;
export type PreviewIntakeInput = z.infer<typeof previewIntakeSchema>;
export type ListUnitsQuery = z.infer<typeof listUnitsQuerySchema>;
export const listAvailableUnitsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  typeKey: z.string().trim().max(60).optional(),
  search: z.string().trim().max(120).optional(),
  holderUserId: z.string().trim().min(1).optional(),
});

export const customerReturnSchema = z.object({
  reasonCode: z.enum([
    "stopped_paying",
    "faulty",
    "cancelled",
    "other",
  ]),
  condition: z.string().trim().max(80).optional(),
  note: z.string().trim().max(2000).optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;
export type RespondTransferInput = z.infer<typeof respondTransferSchema>;
export type DeclineTransferInput = z.infer<typeof declineTransferSchema>;
export type ListAvailableUnitsQuery = z.infer<
  typeof listAvailableUnitsQuerySchema
>;
export type CustomerReturnInput = z.infer<typeof customerReturnSchema>;
