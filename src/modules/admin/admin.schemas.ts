import { z } from "zod";

export const settingsPatchSchema = z.object({
  gpsDistanceMeters: z.number().int().min(1).max(5000).optional(),
  agentGreenDays: z.number().int().min(1).max(365).optional(),
  agentYellowDays: z.number().int().min(1).max(365).optional(),
  tcComplianceGreen: z.number().int().min(0).max(100).optional(),
  tcComplianceYellow: z.number().int().min(0).max(100).optional(),
  monthlyReportDueDay: z.number().int().min(1).max(28).optional(),
  kpiTargets: z.record(z.string(), z.number()).optional(),
  smsTemplates: z.record(z.string(), z.string().max(500)).optional(),
});

export const auditListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  action: z.string().trim().max(120).optional(),
  objectType: z.string().trim().max(80).optional(),
  actorUserId: z.string().min(1).optional(),
});

export type SettingsPatchInput = z.infer<typeof settingsPatchSchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
