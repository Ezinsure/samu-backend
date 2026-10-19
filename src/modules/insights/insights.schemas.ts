import { z } from "zod";

/** Optional calendar month for "this month" KPIs (YYYY-MM). Defaults to current UTC month. */
export const coapDashboardQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM")
    .optional(),
});

export type CoapDashboardQuery = z.infer<typeof coapDashboardQuerySchema>;
