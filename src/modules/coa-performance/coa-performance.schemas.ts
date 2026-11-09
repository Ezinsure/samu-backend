import { z } from "zod";

export const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM");

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.literal("")])
    .optional();

const clientRowBase = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: optionalText(32),
  email: z
    .union([z.string().trim().email().max(320), z.literal("")])
    .optional(),
  nidNumber: optionalText(20),
  accountRef: optionalText(80),
  simNumber: optionalText(40),
});

export const createPerformanceEntrySchema = z.object({
  metricKey: z.string().trim().min(2).max(80),
  month: monthSchema,
  notes: z.string().trim().max(2000).optional(),
  clients: z.array(clientRowBase).max(50).optional(),
});

export type CreatePerformanceEntryInput = z.infer<
  typeof createPerformanceEntrySchema
>;

/** Per-metric required client fields. */
export const CLIENT_FIELD_REQUIREMENTS: Record<
  string,
  Array<"phone" | "email" | "nidNumber" | "accountRef" | "simNumber">
> = {
  bk_accounts: ["phone", "email", "accountRef"],
  ezinsure_agents_applied: ["phone", "email"],
  internet_subscriptions: ["phone", "nidNumber", "simNumber"],
  internet_agents_applied: ["phone", "nidNumber"],
};
