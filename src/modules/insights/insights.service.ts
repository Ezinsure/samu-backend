import type {
  FieldActivity,
  Lead,
  ServiceLine,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { SERVICE_LINES } from "../../lib/service-lines.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { CoapDashboardQuery } from "./insights.schemas.js";

export type PublicLeadSummary = {
  id: string;
  name: string;
  phone: string;
  entityType: Lead["entityType"];
  serviceLine: ServiceLine;
  status: Lead["status"];
  geo: { province: string; district: string; sector: string };
  tcUserId: string;
  notes?: string;
  interestSummary?: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
  tcName?: string;
};

export type PublicActivitySummary = {
  id: string;
  tcUserId: string;
  serviceLine: ServiceLine;
  activityType: FieldActivity["activityType"];
  date: string;
  geo: { province: string; district: string; sector: string };
  venue: string;
  peopleReached: number;
  summary: string;
  outcome: string;
  leadId?: string;
  agentId?: string;
  createdAt: string;
  tcName?: string;
};

export type CoapDashboard = {
  month: string;
  summary: {
    openLeads: number;
    activitiesThisMonth: number;
    onboardingInProgress: number;
    salesThisMonth: number;
    salesAmountRwf: number;
    feedbackOpen: number;
    peopleReached: number;
  };
  byService: Array<{
    serviceLine: ServiceLine;
    label: string;
    leads: number;
    activities: number;
    sales: number;
    onboarding: number;
  }>;
  recentLeads: PublicLeadSummary[];
  recentActivities: PublicActivitySummary[];
};

export type CoapFilterOptions = {
  provinces: string[];
  districts: string[];
  sectors: string[];
  coordinators: Array<{ id: string; name: string }>;
  serviceLines: Array<{ id: ServiceLine; label: string }>;
};

/** Shared TC ownership filter for COAP tables; null = no access. */
type TcScope = { tcUserId?: string };

function scopeWhere(viewer: AuthUser): TcScope | null {
  if (viewer.role === "TERRITORY_COORDINATOR") {
    return { tcUserId: viewer.id };
  }
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") {
    return {};
  }
  return null;
}

function currentUtcMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Inclusive start / exclusive end for a YYYY-MM calendar month (UTC). */
function monthBounds(month: string): { start: Date; end: Date } {
  const [yRaw, mRaw] = month.split("-");
  const y = Number(yRaw);
  const m = Number(mRaw);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toLeadSummary(lead: Lead & { tcUser?: { name: string } }): PublicLeadSummary {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    entityType: lead.entityType,
    serviceLine: lead.serviceLine,
    status: lead.status,
    geo: {
      province: lead.geoProvince,
      district: lead.geoDistrict,
      sector: lead.geoSector,
    },
    tcUserId: lead.tcUserId,
    notes: lead.notes ?? undefined,
    interestSummary: lead.interestSummary ?? undefined,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    convertedAt: lead.convertedAt?.toISOString(),
    tcName: lead.tcUser?.name,
  };
}

function toActivitySummary(
  row: FieldActivity & { tcUser?: { name: string } },
): PublicActivitySummary {
  return {
    id: row.id,
    tcUserId: row.tcUserId,
    serviceLine: row.serviceLine,
    activityType: row.activityType,
    date: formatDateOnly(row.date),
    geo: {
      province: row.geoProvince,
      district: row.geoDistrict,
      sector: row.geoSector,
    },
    venue: row.venue,
    peopleReached: row.peopleReached,
    summary: row.summary,
    outcome: row.outcome,
    leadId: row.leadId ?? undefined,
    agentId: row.agentId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    tcName: row.tcUser?.name,
  };
}

function emptyCountsByLine(): Record<ServiceLine, number> {
  return {
    irembo: 0,
    bk: 0,
    internet: 0,
    device_financing: 0,
    insurance: 0,
    clean_cooking: 0,
  };
}

function applyGroupCounts(
  rows: Array<{ serviceLine: ServiceLine; _count: { _all: number } }>,
): Record<ServiceLine, number> {
  const counts = emptyCountsByLine();
  for (const row of rows) {
    counts[row.serviceLine] = row._count._all;
  }
  return counts;
}

/**
 * Programme dashboard — KPIs + by-service breakdown + recent leads/activities.
 * Optional `month` (YYYY-MM) scopes "this month" metrics; defaults to current UTC month.
 * Seed data is dated 2026-09 — use `?month=2026-09` when exercising demos after that month.
 */
export async function getCoapDashboard(
  query: CoapDashboardQuery,
  viewer: AuthUser,
): Promise<CoapDashboard> {
  const month = query.month ?? currentUtcMonth();
  const { start, end } = monthBounds(month);
  const scope = scopeWhere(viewer);

  if (scope === null) {
    return {
      month,
      summary: {
        openLeads: 0,
        activitiesThisMonth: 0,
        onboardingInProgress: 0,
        salesThisMonth: 0,
        salesAmountRwf: 0,
        feedbackOpen: 0,
        peopleReached: 0,
      },
      byService: SERVICE_LINES.map((meta) => ({
        serviceLine: meta.id,
        label: meta.shortLabel,
        leads: 0,
        activities: 0,
        sales: 0,
        onboarding: 0,
      })),
      recentLeads: [],
      recentActivities: [],
    };
  }

  const leadWhere: Prisma.LeadWhereInput = { ...scope };
  const activityWhere: Prisma.FieldActivityWhereInput = { ...scope };
  const onboardingWhere: Prisma.OnboardingCaseWhereInput = { ...scope };
  const saleWhere: Prisma.SaleWhereInput = { ...scope };
  const feedbackWhere: Prisma.CommunityFeedbackWhereInput = { ...scope };

  const [
    openLeads,
    activitiesThisMonth,
    onboardingInProgress,
    salesThisMonthAgg,
    feedbackOpen,
    peopleReachedAgg,
    leadsByLine,
    activitiesByLine,
    salesByLine,
    onboardingByLine,
    recentLeads,
    recentActivities,
  ] = await Promise.all([
    prisma.lead.count({
      where: {
        ...leadWhere,
        status: { notIn: ["converted", "lost"] },
      },
    }),
    prisma.fieldActivity.count({
      where: {
        ...activityWhere,
        date: { gte: start, lt: end },
      },
    }),
    prisma.onboardingCase.count({
      where: {
        ...onboardingWhere,
        status: { in: ["in_progress", "pending_partner"] },
      },
    }),
    prisma.sale.aggregate({
      where: {
        ...saleWhere,
        soldAt: { gte: start, lt: end },
      },
      _count: { _all: true },
      _sum: { amountRwf: true },
    }),
    prisma.communityFeedback.count({
      where: {
        ...feedbackWhere,
        status: { in: ["open", "acknowledged"] },
      },
    }),
    prisma.fieldActivity.aggregate({
      where: activityWhere,
      _sum: { peopleReached: true },
    }),
    prisma.lead.groupBy({
      by: ["serviceLine"],
      where: leadWhere,
      _count: { _all: true },
    }),
    prisma.fieldActivity.groupBy({
      by: ["serviceLine"],
      where: activityWhere,
      _count: { _all: true },
    }),
    prisma.sale.groupBy({
      by: ["serviceLine"],
      where: saleWhere,
      _count: { _all: true },
    }),
    prisma.onboardingCase.groupBy({
      by: ["serviceLine"],
      where: onboardingWhere,
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: leadWhere,
      include: { tcUser: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.fieldActivity.findMany({
      where: activityWhere,
      include: { tcUser: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);

  const leadCounts = applyGroupCounts(leadsByLine);
  const activityCounts = applyGroupCounts(activitiesByLine);
  const saleCounts = applyGroupCounts(salesByLine);
  const onboardingCounts = applyGroupCounts(onboardingByLine);

  return {
    month,
    summary: {
      openLeads,
      activitiesThisMonth,
      onboardingInProgress,
      salesThisMonth: salesThisMonthAgg._count._all,
      salesAmountRwf: salesThisMonthAgg._sum.amountRwf ?? 0,
      feedbackOpen,
      peopleReached: peopleReachedAgg._sum.peopleReached ?? 0,
    },
    byService: SERVICE_LINES.map((meta) => ({
      serviceLine: meta.id,
      label: meta.shortLabel,
      leads: leadCounts[meta.id],
      activities: activityCounts[meta.id],
      sales: saleCounts[meta.id],
      onboarding: onboardingCounts[meta.id],
    })),
    recentLeads: recentLeads.map(toLeadSummary),
    recentActivities: recentActivities.map(toActivitySummary),
  };
}

/**
 * Shared filter dropdown options for COAP create forms (TC-scoped geo + coordinators).
 */
export async function getCoapFilterOptions(
  viewer: AuthUser,
): Promise<CoapFilterOptions> {
  const scope = scopeWhere(viewer);
  const empty: CoapFilterOptions = {
    provinces: ["Kigali City", "Southern Province"],
    districts: ["Gasabo", "Kicukiro", "Nyarugenge", "Huye", "Muhanga"],
    sectors: [
      "Remera",
      "Kimironko",
      "Kanombe",
      "Nyamirambo",
      "Gikondo",
      "Ngoma",
      "Nyamabuye",
    ],
    coordinators: [],
    serviceLines: SERVICE_LINES.map((item) => ({
      id: item.id,
      label: item.shortLabel,
    })),
  };

  if (scope === null) {
    return empty;
  }

  const [leadGeos, coordinators] = await Promise.all([
    prisma.lead.findMany({
      where: scope,
      select: {
        geoProvince: true,
        geoDistrict: true,
        geoSector: true,
      },
    }),
    prisma.user.findMany({
      where: { role: "TERRITORY_COORDINATOR", status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const provinces = Array.from(
    new Set(leadGeos.map((r) => r.geoProvince)),
  ).sort();
  const districts = Array.from(
    new Set(leadGeos.map((r) => r.geoDistrict)),
  ).sort();
  const sectors = Array.from(
    new Set(leadGeos.map((r) => r.geoSector)),
  ).sort();

  return {
    provinces: provinces.length > 0 ? provinces : empty.provinces,
    districts: districts.length > 0 ? districts : empty.districts,
    sectors: sectors.length > 0 ? sectors : empty.sectors,
    coordinators,
    serviceLines: empty.serviceLines,
  };
}
