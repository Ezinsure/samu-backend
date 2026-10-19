import type { Agent, Prisma, SmsConfirmationStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { DashboardFilters } from "./analytics.schemas.js";

const COMPLIANCE_COLORS = {
  green: "#16A34A",
  yellow: "#D97706",
  red: "#DC2626",
} as const;

const CONFIRMATION_COLORS: Record<SmsConfirmationStatus, string> = {
  confirmed: "#16A34A",
  pending: "#D97706",
  disputed: "#DC2626",
  expired: "#94A3B8",
  delivery_failed: "#64748B",
};

const CONFIRMATION_LABELS: Record<SmsConfirmationStatus, string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  disputed: "Disputed",
  expired: "Expired",
  delivery_failed: "Delivery failed",
};

/** Days without a visit before an agent is considered overdue (until B14 settings). */
const OVERDUE_AFTER_DAYS = 60;

type AgentServices = {
  telecomTools?: boolean;
  internetAvailable?: boolean;
  insuranceTools?: boolean;
  printer?: boolean;
  brandingVisible?: boolean;
};

function parseServices(json: Prisma.JsonValue): AgentServices {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return json as AgentServices;
}

function daysSince(dateIso?: string | null, now = new Date()): number {
  if (!dateIso) return 999;
  const then = new Date(dateIso);
  return Math.max(
    0,
    Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

function currentUtcMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function agentWhere(
  viewer: AuthUser,
  filters: DashboardFilters,
): Prisma.AgentWhereInput | null {
  const where: Prisma.AgentWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return null;
  } else if (filters.tcUserId) {
    where.tcUserId = filters.tcUserId;
  }

  if (filters.province) where.geoProvince = filters.province;
  if (filters.district) where.geoDistrict = filters.district;
  return where;
}

function visitDateFilter(
  filters: DashboardFilters,
): Prisma.DateTimeFilter | undefined {
  const range: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) {
    range.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  }
  if (filters.dateTo) {
    range.lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
  }
  return Object.keys(range).length > 0 ? range : undefined;
}

/**
 * National / TC operations dashboard — compliance, visits, trends, leaderboard.
 */
export async function getDashboardAnalytics(
  filters: DashboardFilters,
  viewer: AuthUser,
) {
  const where = agentWhere(viewer, filters);
  if (where === null) {
    return emptyDashboard();
  }

  const agents = await prisma.agent.findMany({
    where,
    include: { tcUser: { select: { id: true, name: true } } },
  });
  const agentIds = agents.map((a) => a.id);

  const startedAt = visitDateFilter(filters);
  const visitWhere: Prisma.VisitWhereInput = {
    agentId: { in: agentIds.length > 0 ? agentIds : ["__none__"] },
  };
  if (viewer.role === "TERRITORY_COORDINATOR") {
    visitWhere.tcUserId = viewer.id;
  } else if (filters.tcUserId) {
    visitWhere.tcUserId = filters.tcUserId;
  }
  if (startedAt) visitWhere.startedAt = startedAt;

  const [scopedVisits, openFraudFlags, coordinators, allScopedForFilters] =
    await Promise.all([
      prisma.visit.findMany({
        where: visitWhere,
        select: {
          id: true,
          agentId: true,
          tcUserId: true,
          startedAt: true,
          confirmationStatus: true,
        },
      }),
      viewer.role === "TERRITORY_COORDINATOR"
        ? Promise.resolve(0)
        : prisma.fraudFlag.count({
            where: { status: { in: ["open", "escalated"] } },
          }),
      prisma.user.findMany({
        where: { role: "TERRITORY_COORDINATOR", status: "active" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.agent.findMany({
        where:
          viewer.role === "TERRITORY_COORDINATOR"
            ? { tcUserId: viewer.id }
            : {},
        select: { geoProvince: true, geoDistrict: true },
      }),
    ]);

  // Trend visits: same TC/agent scope but ignore date filters so months fill in.
  const trendVisitWhere: Prisma.VisitWhereInput = {
    agentId: { in: agentIds.length > 0 ? agentIds : ["__none__"] },
  };
  if (viewer.role === "TERRITORY_COORDINATOR") {
    trendVisitWhere.tcUserId = viewer.id;
  } else if (filters.tcUserId) {
    trendVisitWhere.tcUserId = filters.tcUserId;
  }
  const trendVisits = await prisma.visit.findMany({
    where: trendVisitWhere,
    select: { agentId: true, startedAt: true },
  });

  const monthPrefix = currentUtcMonth();
  const activeAgents = agents.filter((a) => a.status === "Active").length;
  const overdueAgents = agents.filter((a) => a.compliance === "red").length;
  const dueSoonAgents = agents.filter((a) => a.compliance === "yellow").length;
  const compliantAgents = agents.filter((a) => a.compliance === "green").length;
  const visitedThisMonth = agents.filter((a) =>
    a.lastVisitAt?.toISOString().startsWith(monthPrefix),
  ).length;

  const confirmationRate = Math.round(
    (scopedVisits.filter((v) => v.confirmationStatus === "confirmed").length /
      Math.max(scopedVisits.length, 1)) *
      100,
  );
  const compliancePercent = Math.round(
    (compliantAgents / Math.max(agents.length, 1)) * 100,
  );

  const visitsByTcMap = new Map<string, number>();
  for (const visit of scopedVisits) {
    visitsByTcMap.set(
      visit.tcUserId,
      (visitsByTcMap.get(visit.tcUserId) ?? 0) + 1,
    );
  }

  const agentById = new Map(agents.map((a) => [a.id, a]));
  const visitsByDistrictMap = new Map<string, number>();
  for (const visit of scopedVisits) {
    const district = agentById.get(visit.agentId)?.geoDistrict ?? "Unknown";
    visitsByDistrictMap.set(
      district,
      (visitsByDistrictMap.get(district) ?? 0) + 1,
    );
  }

  const liveTrendMap = new Map<string, { visits: number; agents: Set<string> }>();
  for (const visit of trendVisits) {
    const month = visit.startedAt.toISOString().slice(0, 7);
    if (filters.dateFrom && `${month}-28` < filters.dateFrom) continue;
    if (filters.dateTo && `${month}-01` > filters.dateTo) continue;
    const entry =
      liveTrendMap.get(month) ?? { visits: 0, agents: new Set<string>() };
    entry.visits += 1;
    entry.agents.add(visit.agentId);
    liveTrendMap.set(month, entry);
  }

  const monthlyTrend = Array.from(liveTrendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => ({
      month: month.includes("-") ? month.slice(5) : month,
      visits: stats.visits,
      uniqueAgents: stats.agents.size,
    }));

  const overdueList = agents
    .filter((agent) => agent.compliance === "red")
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      code: agent.code,
      district: agent.geoDistrict,
      lastVisitAt: agent.lastVisitAt?.toISOString(),
      daysOverdue: Math.max(
        0,
        daysSince(agent.lastVisitAt?.toISOString()) - OVERDUE_AFTER_DAYS,
      ),
      tcUserId: agent.tcUserId,
      tcName: agent.tcUser.name,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const tcIds = Array.from(new Set(agents.map((a) => a.tcUserId)));
  const leaderboard = tcIds
    .map((tcUserId) => {
      const tcAgents = agents.filter((a) => a.tcUserId === tcUserId);
      const green = tcAgents.filter((a) => a.compliance === "green").length;
      return {
        tcUserId,
        name: tcAgents[0]?.tcUser.name ?? tcUserId,
        agents: tcAgents.length,
        visits: visitsByTcMap.get(tcUserId) ?? 0,
        compliancePercent: Math.round(
          (green / Math.max(tcAgents.length, 1)) * 100,
        ),
      };
    })
    .sort((a, b) => b.compliancePercent - a.compliancePercent);

  const provinces = Array.from(
    new Set(allScopedForFilters.map((a) => a.geoProvince)),
  ).sort();
  const districts = Array.from(
    new Set(
      allScopedForFilters
        .filter((a) =>
          filters.province ? a.geoProvince === filters.province : true,
        )
        .map((a) => a.geoDistrict),
    ),
  ).sort();

  const withoutTelecom = agents.filter(
    (a) => !parseServices(a.servicesJson).telecomTools,
  ).length;
  const withoutInternet = agents.filter(
    (a) => !parseServices(a.servicesJson).internetAvailable,
  ).length;
  const withoutInsurance = agents.filter(
    (a) => !parseServices(a.servicesJson).insuranceTools,
  ).length;
  const withoutPrinter = agents.filter(
    (a) => !parseServices(a.servicesJson).printer,
  ).length;
  const withoutBranding = agents.filter(
    (a) => !parseServices(a.servicesJson).brandingVisible,
  ).length;

  const tcNameById = new Map(
    agents.map((a) => [a.tcUserId, a.tcUser.name] as const),
  );

  return {
    summary: {
      totalAgents: agents.length,
      activeAgents,
      overdueAgents,
      dueSoonAgents,
      compliantAgents,
      visitedThisMonth,
      visitsInRange: scopedVisits.length,
      confirmationRate,
      openFraudFlags,
      openActionItems: 0,
      compliancePercent,
      agentsWithoutTelecom: withoutTelecom,
      agentsWithoutInternet: withoutInternet,
      agentsWithoutInsurance: withoutInsurance,
    },
    complianceDistribution: [
      {
        key: "green" as const,
        label: "Compliant",
        value: compliantAgents,
        fill: COMPLIANCE_COLORS.green,
      },
      {
        key: "yellow" as const,
        label: "Due soon",
        value: dueSoonAgents,
        fill: COMPLIANCE_COLORS.yellow,
      },
      {
        key: "red" as const,
        label: "Overdue",
        value: overdueAgents,
        fill: COMPLIANCE_COLORS.red,
      },
    ],
    visitsByTc: Array.from(visitsByTcMap.entries())
      .map(([id, visits]) => ({
        name: tcNameById.get(id) ?? id,
        visits,
      }))
      .sort((a, b) => b.visits - a.visits),
    visitsByDistrict: Array.from(visitsByDistrictMap.entries())
      .map(([name, visits]) => ({ name, visits }))
      .sort((a, b) => b.visits - a.visits),
    monthlyTrend,
    serviceGaps: [
      { name: "No telecom tools", count: withoutTelecom },
      { name: "No internet", count: withoutInternet },
      { name: "No insurance tools", count: withoutInsurance },
      { name: "No printer", count: withoutPrinter },
      { name: "No branding", count: withoutBranding },
    ],
    overdueAgents: overdueList,
    leaderboard,
    filterOptions: {
      provinces,
      districts,
      coordinators,
    },
  };
}

function emptyDashboard() {
  return {
    summary: {
      totalAgents: 0,
      activeAgents: 0,
      overdueAgents: 0,
      dueSoonAgents: 0,
      compliantAgents: 0,
      visitedThisMonth: 0,
      visitsInRange: 0,
      confirmationRate: 0,
      openFraudFlags: 0,
      openActionItems: 0,
      compliancePercent: 0,
      agentsWithoutTelecom: 0,
      agentsWithoutInternet: 0,
      agentsWithoutInsurance: 0,
    },
    complianceDistribution: [
      { key: "green" as const, label: "Compliant", value: 0, fill: COMPLIANCE_COLORS.green },
      { key: "yellow" as const, label: "Due soon", value: 0, fill: COMPLIANCE_COLORS.yellow },
      { key: "red" as const, label: "Overdue", value: 0, fill: COMPLIANCE_COLORS.red },
    ],
    visitsByTc: [] as Array<{ name: string; visits: number }>,
    visitsByDistrict: [] as Array<{ name: string; visits: number }>,
    monthlyTrend: [] as Array<{ month: string; visits: number; uniqueAgents: number }>,
    serviceGaps: [] as Array<{ name: string; count: number }>,
    overdueAgents: [] as unknown[],
    leaderboard: [] as unknown[],
    filterOptions: {
      provinces: [] as string[],
      districts: [] as string[],
      coordinators: [] as Array<{ id: string; name: string }>,
    },
  };
}

/**
 * Analytics page workspace — dashboard + SMS confirmation breakdown/trend.
 */
export async function getAnalyticsWorkspace(
  filters: DashboardFilters,
  viewer: AuthUser,
) {
  const base = await getDashboardAnalytics(filters, viewer);
  const where = agentWhere(viewer, filters);
  if (where === null) {
    return {
      ...base,
      confirmationBreakdown: [],
      confirmationTrend: [],
    };
  }

  const agents = await prisma.agent.findMany({
    where,
    select: { id: true },
  });
  const agentIds = agents.map((a) => a.id);
  const startedAt = visitDateFilter(filters);
  const visitWhere: Prisma.VisitWhereInput = {
    agentId: { in: agentIds.length > 0 ? agentIds : ["__none__"] },
  };
  if (viewer.role === "TERRITORY_COORDINATOR") {
    visitWhere.tcUserId = viewer.id;
  } else if (filters.tcUserId) {
    visitWhere.tcUserId = filters.tcUserId;
  }
  if (startedAt) visitWhere.startedAt = startedAt;

  const scopedVisits = await prisma.visit.findMany({
    where: visitWhere,
    select: { startedAt: true, confirmationStatus: true },
  });

  const counts = new Map<SmsConfirmationStatus, number>();
  for (const visit of scopedVisits) {
    counts.set(
      visit.confirmationStatus,
      (counts.get(visit.confirmationStatus) ?? 0) + 1,
    );
  }

  const confirmationBreakdown = (
    Object.keys(CONFIRMATION_LABELS) as SmsConfirmationStatus[]
  )
    .map((key) => ({
      key,
      label: CONFIRMATION_LABELS[key],
      value: counts.get(key) ?? 0,
      fill: CONFIRMATION_COLORS[key],
    }))
    .filter((row) => row.value > 0);

  const byMonth = new Map<string, { confirmed: number; total: number }>();
  for (const visit of scopedVisits) {
    const month = visit.startedAt.toISOString().slice(0, 7);
    const entry = byMonth.get(month) ?? { confirmed: 0, total: 0 };
    entry.total += 1;
    if (visit.confirmationStatus === "confirmed") entry.confirmed += 1;
    byMonth.set(month, entry);
  }

  const confirmationTrend = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, stats]) => ({
      month: month.slice(5),
      confirmed: stats.confirmed,
      total: stats.total,
      rate: Math.round((stats.confirmed / Math.max(stats.total, 1)) * 100),
    }));

  return {
    ...base,
    confirmationBreakdown,
    confirmationTrend,
  };
}

function statusToApi(status: Agent["status"]): string {
  return status === "PendingVerification" ? "Pending verification" : status;
}

/**
 * Map page — agent lat/lng points with compliance summary.
 */
export async function getMapWorkspace(
  filters: {
    province?: string;
    district?: string;
    tcUserId?: string;
    compliance?: "green" | "yellow" | "red";
    status?: string;
  },
  viewer: AuthUser,
) {
  const where: Prisma.AgentWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      points: [],
      summary: { total: 0, green: 0, yellow: 0, red: 0 },
      filterOptions: { provinces: [], districts: [], coordinators: [] },
      bounds: { center: { lat: -1.95, lng: 30.06 }, zoom: 9.5 },
    };
  } else if (filters.tcUserId) {
    where.tcUserId = filters.tcUserId;
  }

  if (filters.province) where.geoProvince = filters.province;
  if (filters.district) where.geoDistrict = filters.district;
  if (filters.compliance) where.compliance = filters.compliance;
  if (filters.status) {
    where.status =
      filters.status === "Pending verification"
        ? "PendingVerification"
        : (filters.status as Agent["status"]);
  }

  const [agents, coordinators, scopedForFilters] = await Promise.all([
    prisma.agent.findMany({
      where,
      include: { tcUser: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: "TERRITORY_COORDINATOR", status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.agent.findMany({
      where:
        viewer.role === "TERRITORY_COORDINATOR"
          ? { tcUserId: viewer.id }
          : {},
      select: { geoProvince: true, geoDistrict: true },
    }),
  ]);

  const points = agents.map((agent) => ({
    id: agent.id,
    code: agent.code,
    name: agent.name,
    phone: agent.phone,
    status: statusToApi(agent.status),
    compliance: agent.compliance,
    province: agent.geoProvince,
    district: agent.geoDistrict,
    sector: agent.geoSector,
    lat: agent.lat,
    lng: agent.lng,
    tcUserId: agent.tcUserId,
    tcName: agent.tcUser.name,
    lastVisitAt: agent.lastVisitAt?.toISOString(),
  }));

  const provinces = Array.from(
    new Set(scopedForFilters.map((a) => a.geoProvince)),
  ).sort();
  const districts = Array.from(
    new Set(
      scopedForFilters
        .filter((a) =>
          filters.province ? a.geoProvince === filters.province : true,
        )
        .map((a) => a.geoDistrict),
    ),
  ).sort();

  const avgLat =
    points.reduce((sum, p) => sum + p.lat, 0) / Math.max(points.length, 1);
  const avgLng =
    points.reduce((sum, p) => sum + p.lng, 0) / Math.max(points.length, 1);

  return {
    points,
    summary: {
      total: points.length,
      green: points.filter((p) => p.compliance === "green").length,
      yellow: points.filter((p) => p.compliance === "yellow").length,
      red: points.filter((p) => p.compliance === "red").length,
    },
    filterOptions: {
      provinces,
      districts,
      coordinators,
    },
    bounds: {
      center: {
        lat: Number.isFinite(avgLat) ? avgLat : -1.95,
        lng: Number.isFinite(avgLng) ? avgLng : 30.06,
      },
      zoom: viewer.role === "TERRITORY_COORDINATOR" ? 11 : 9.5,
    },
  };
}
