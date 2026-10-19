import type { SystemSettings } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { DEFAULT_KPI_TARGETS } from "./reporting.js";
import { prisma } from "./prisma.js";

export type PublicSettings = {
  gpsDistanceMeters: number;
  agentGreenDays: number;
  agentYellowDays: number;
  tcComplianceGreen: number;
  tcComplianceYellow: number;
  monthlyReportDueDay: number;
  kpiTargets: Record<string, number>;
  smsTemplates: Record<string, string>;
  updatedAt?: string;
  updatedByUserId?: string;
};

const DEFAULT_SMS_TEMPLATES: Record<string, string> = {
  visit_confirmation:
    "SAMU: A territory coordinator visited you today. Reply YES to confirm or NO if incorrect.",
  visit_reminder:
    "SAMU reminder: please confirm your recent agent visit via SMS.",
};

function asRecord(json: Prisma.JsonValue): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ...DEFAULT_KPI_TARGETS };
  }
  return { ...DEFAULT_KPI_TARGETS, ...(json as Record<string, number>) };
}

function asStringRecord(json: Prisma.JsonValue): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ...DEFAULT_SMS_TEMPLATES };
  }
  return { ...DEFAULT_SMS_TEMPLATES, ...(json as Record<string, string>) };
}

export function toPublicSettings(row: SystemSettings): PublicSettings {
  return {
    gpsDistanceMeters: row.gpsDistanceMeters,
    agentGreenDays: row.agentGreenDays,
    agentYellowDays: row.agentYellowDays,
    tcComplianceGreen: row.tcComplianceGreen,
    tcComplianceYellow: row.tcComplianceYellow,
    monthlyReportDueDay: row.monthlyReportDueDay,
    kpiTargets: asRecord(row.kpiTargetsJson),
    smsTemplates: asStringRecord(row.smsTemplatesJson),
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId ?? undefined,
  };
}

/**
 * Ensure the singleton settings row exists (idempotent).
 */
export async function ensureSettingsRow(): Promise<SystemSettings> {
  return prisma.systemSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      gpsDistanceMeters: env.GPS_DISTANCE_METERS,
      agentGreenDays: 60,
      agentYellowDays: 30,
      tcComplianceGreen: 90,
      tcComplianceYellow: 70,
      monthlyReportDueDay: 5,
      kpiTargetsJson: DEFAULT_KPI_TARGETS,
      smsTemplatesJson: DEFAULT_SMS_TEMPLATES,
    },
    update: {},
  });
}

export async function getSettings(): Promise<PublicSettings> {
  const row = await ensureSettingsRow();
  return toPublicSettings(row);
}

/** GPS threshold used by visit validation — DB settings with env fallback. */
export async function getGpsThresholdMeters(): Promise<number> {
  try {
    const row = await ensureSettingsRow();
    return row.gpsDistanceMeters;
  } catch {
    return env.GPS_DISTANCE_METERS;
  }
}

export async function getKpiTargets(): Promise<Record<string, number>> {
  try {
    const settings = await getSettings();
    return settings.kpiTargets;
  } catch {
    return { ...DEFAULT_KPI_TARGETS };
  }
}
