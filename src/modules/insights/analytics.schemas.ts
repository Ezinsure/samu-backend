import { z } from "zod";

export const dashboardFiltersSchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  province: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  tcUserId: z.string().min(1).optional(),
});

export type DashboardFilters = z.infer<typeof dashboardFiltersSchema>;

export const mapFiltersSchema = z.object({
  province: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  tcUserId: z.string().min(1).optional(),
  compliance: z.enum(["green", "yellow", "red"]).optional(),
  status: z
    .enum(["Active", "Inactive", "Suspended", "Pending verification"])
    .optional(),
});

export type MapFilters = z.infer<typeof mapFiltersSchema>;
