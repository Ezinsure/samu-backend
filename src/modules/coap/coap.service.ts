import type {
  FieldActivity,
  Lead,
  OnboardingCase,
  ServiceLine,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { SERVICE_LINES, serviceLineMeta } from "../../lib/service-lines.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";

export type ServiceLineSummary = {
  id: ServiceLine;
  label: string;
  shortLabel: string;
  description: string;
  tasks: string[];
  leads: number;
  openLeads: number;
  activities: number;
  onboardingOpen: number;
  sales: number;
  salesAmountRwf: number;
  feedbackOpen: number;
};

export type ServiceWorkspace = {
  line: ServiceLineSummary;
  recent: {
    leads: Array<{
      id: string;
      name: string;
      status: Lead["status"];
      serviceLine: ServiceLine;
      updatedAt: string;
      tcName?: string;
    }>;
    activities: Array<{
      id: string;
      activityType: FieldActivity["activityType"];
      venue: string;
      date: string;
      serviceLine: ServiceLine;
      tcName?: string;
    }>;
    onboarding: Array<{
      id: string;
      customerName: string;
      status: OnboardingCase["status"];
      serviceLine: ServiceLine;
      updatedAt: string;
      tcName?: string;
    }>;
    sales: Array<{
      id: string;
      productName: string;
      amountRwf: number;
      serviceLine: ServiceLine;
      soldAt: string;
      tcName?: string;
    }>;
  };
};

/** Shared ownership + optional service-line filter; null = no access. */
type CoapScope = { tcUserId?: string; serviceLine?: ServiceLine };

function baseWhere(
  viewer: AuthUser,
  serviceLine?: ServiceLine,
): CoapScope | null {
  if (viewer.role === "TERRITORY_COORDINATOR") {
    return {
      tcUserId: viewer.id,
      ...(serviceLine ? { serviceLine } : {}),
    };
  }
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") {
    return serviceLine ? { serviceLine } : {};
  }
  return null;
}

function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function summarizeLine(
  serviceLine: ServiceLine,
  viewer: AuthUser,
): Promise<ServiceLineSummary> {
  const meta = serviceLineMeta(serviceLine);
  const scope = baseWhere(viewer, serviceLine);
  if (scope === null) {
    return {
      id: meta.id,
      label: meta.label,
      shortLabel: meta.shortLabel,
      description: meta.description,
      tasks: meta.tasks,
      leads: 0,
      openLeads: 0,
      activities: 0,
      onboardingOpen: 0,
      sales: 0,
      salesAmountRwf: 0,
      feedbackOpen: 0,
    };
  }

  const activityWhere: Prisma.FieldActivityWhereInput = { ...scope };
  const onboardingWhere: Prisma.OnboardingCaseWhereInput = { ...scope };
  const saleWhere: Prisma.SaleWhereInput = { ...scope };
  // Feedback may omit serviceLine; count only rows tagged to this line.
  const feedbackWhere: Prisma.CommunityFeedbackWhereInput = {
    ...scope,
    serviceLine,
  };

  const [leads, openLeads, activities, onboardingOpen, salesAgg, feedbackOpen] =
    await Promise.all([
      prisma.lead.count({ where: scope }),
      prisma.lead.count({
        where: { ...scope, status: { notIn: ["converted", "lost"] } },
      }),
      prisma.fieldActivity.count({ where: activityWhere }),
      prisma.onboardingCase.count({
        where: {
          ...onboardingWhere,
          status: { notIn: ["completed", "cancelled"] },
        },
      }),
      prisma.sale.aggregate({
        where: saleWhere,
        _count: { _all: true },
        _sum: { amountRwf: true },
      }),
      prisma.communityFeedback.count({
        where: {
          ...feedbackWhere,
          status: { in: ["open", "acknowledged"] },
        },
      }),
    ]);

  return {
    id: meta.id,
    label: meta.label,
    shortLabel: meta.shortLabel,
    description: meta.description,
    tasks: meta.tasks,
    leads,
    openLeads,
    activities,
    onboardingOpen,
    sales: salesAgg._count._all,
    salesAmountRwf: salesAgg._sum.amountRwf ?? 0,
    feedbackOpen,
  };
}

/**
 * Services hub — one summary card per service line (TC-scoped).
 */
export async function getServicesWorkspace(
  viewer: AuthUser,
): Promise<{ lines: ServiceLineSummary[] }> {
  const lines = await Promise.all(
    SERVICE_LINES.map((meta) => summarizeLine(meta.id, viewer)),
  );
  return { lines };
}

/**
 * Single service cockpit — summary + recent leads/activities/onboarding/sales.
 * Replaces the frontend fan-out of five list calls.
 */
export async function getServiceLineWorkspace(
  line: ServiceLine,
  viewer: AuthUser,
): Promise<ServiceWorkspace> {
  const meta = SERVICE_LINES.find((item) => item.id === line);
  if (!meta) {
    throw errors.notFound("Unknown service line");
  }

  const scope = baseWhere(viewer, line);
  const summary = await summarizeLine(line, viewer);

  if (scope === null) {
    return {
      line: summary,
      recent: { leads: [], activities: [], onboarding: [], sales: [] },
    };
  }

  const activityWhere: Prisma.FieldActivityWhereInput = { ...scope };
  const onboardingWhere: Prisma.OnboardingCaseWhereInput = { ...scope };
  const saleWhere: Prisma.SaleWhereInput = { ...scope };

  const [leads, activities, onboarding, sales] = await Promise.all([
    prisma.lead.findMany({
      where: scope,
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
    prisma.onboardingCase.findMany({
      where: onboardingWhere,
      include: { tcUser: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.sale.findMany({
      where: saleWhere,
      include: { tcUser: { select: { name: true } } },
      orderBy: { soldAt: "desc" },
      take: 5,
    }),
  ]);

  return {
    line: summary,
    recent: {
      leads: leads.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        serviceLine: row.serviceLine,
        updatedAt: row.updatedAt.toISOString(),
        tcName: row.tcUser.name,
      })),
      activities: activities.map((row) => ({
        id: row.id,
        activityType: row.activityType,
        venue: row.venue,
        date: formatDateOnly(row.date),
        serviceLine: row.serviceLine,
        tcName: row.tcUser.name,
      })),
      onboarding: onboarding.map((row) => ({
        id: row.id,
        customerName: row.customerName,
        status: row.status,
        serviceLine: row.serviceLine,
        updatedAt: row.updatedAt.toISOString(),
        tcName: row.tcUser.name,
      })),
      sales: sales.map((row) => ({
        id: row.id,
        productName: row.productName,
        amountRwf: row.amountRwf,
        serviceLine: row.serviceLine,
        soldAt: row.soldAt.toISOString(),
        tcName: row.tcUser.name,
      })),
    },
  };
}
