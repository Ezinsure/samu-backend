import type { MonthlyReport, Prisma, ReportStatus } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import {
  DEFAULT_KPI_TARGETS,
  EMPTY_NARRATIVE,
  NARRATIVE_KEYS,
  daysUntilDeadline,
  formatDateOnly,
  kpiProgressPercent,
  periodDeadline,
  type ReportNarrative,
} from "../../lib/reporting.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type {
  ReportCreateInput,
  ReportDraftInput,
  ReportListQuery,
} from "./reports.schemas.js";

type HistoryEvent = {
  id: string;
  at: string;
  byUserId: string;
  action: "save_draft" | "submit" | "request_changes" | "resubmit" | "review";
  notes?: string;
  status: ReportStatus;
};

type AgentSnapshot = {
  agentId: string;
  code: string;
  name: string;
  district: string;
  sector: string;
  status: string;
  compliance: string;
  lastVisitAt?: string;
  recruitedThisMonth: boolean;
  reactivatedThisMonth: boolean;
};

export type PublicReport = {
  id: string;
  tcUserId: string;
  period: string;
  status: ReportStatus;
  deadline: string;
  submittedAt?: string;
  territorySnapshot: string[];
  kpiActuals: Record<string, number>;
  narrative: ReportNarrative;
  agentMappingSnapshot: AgentSnapshot[];
  reviewNotes?: string;
  history: HistoryEvent[];
  tcName?: string;
  daysToDeadline: number;
  overdue: boolean;
  kpiProgressPercent: number;
};

function canEdit(report: MonthlyReport, viewer: AuthUser): boolean {
  if (viewer.role === "MD_VIEWER") return false;
  if (viewer.role === "TERRITORY_COORDINATOR") {
    return (
      report.tcUserId === viewer.id &&
      (report.status === "draft" || report.status === "changes_requested")
    );
  }
  return false;
}

function canReview(role: AuthUser["role"]): boolean {
  return role === "ADMIN" || role === "OPERATIONS_MANAGER";
}

function assertCanView(reportTcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && reportTcUserId === viewer.id) {
    return;
  }
  throw errors.forbidden();
}

function asRecord(json: Prisma.JsonValue): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return json as Record<string, number>;
}

function asNarrative(json: Prisma.JsonValue): ReportNarrative {
  const base = { ...EMPTY_NARRATIVE };
  if (!json || typeof json !== "object" || Array.isArray(json)) return base;
  return { ...base, ...(json as Partial<ReportNarrative>) };
}

function asStringArray(json: Prisma.JsonValue): string[] {
  return Array.isArray(json) ? (json as string[]) : [];
}

function asHistory(json: Prisma.JsonValue): HistoryEvent[] {
  return Array.isArray(json) ? (json as HistoryEvent[]) : [];
}

function asAgents(json: Prisma.JsonValue): AgentSnapshot[] {
  return Array.isArray(json) ? (json as AgentSnapshot[]) : [];
}

function toPublic(
  report: MonthlyReport & { tcUser?: { name: string } },
): PublicReport {
  const kpiActuals = asRecord(report.kpiActualsJson);
  const days = daysUntilDeadline(report.deadline);
  return {
    id: report.id,
    tcUserId: report.tcUserId,
    period: report.period,
    status: report.status,
    deadline: formatDateOnly(report.deadline),
    submittedAt: report.submittedAt?.toISOString(),
    territorySnapshot: asStringArray(report.territorySnapshotJson),
    kpiActuals,
    narrative: asNarrative(report.narrativeJson),
    agentMappingSnapshot: asAgents(report.agentSnapshotJson),
    reviewNotes: report.reviewNotes ?? undefined,
    history: asHistory(report.historyJson),
    tcName: report.tcUser?.name,
    daysToDeadline: days,
    overdue:
      days < 0 &&
      (report.status === "draft" || report.status === "changes_requested"),
    kpiProgressPercent: kpiProgressPercent(kpiActuals),
  };
}

function appendHistory(
  existing: Prisma.JsonValue,
  event: HistoryEvent,
): HistoryEvent[] {
  return [...asHistory(existing), event];
}

async function territoryNamesForTc(tcUserId: string): Promise<string[]> {
  const assignments = await prisma.territoryAssignment.findMany({
    where: { tcUserId, active: true },
    include: { territory: { select: { name: true } } },
  });
  return assignments.map((a) => a.territory.name).sort();
}

async function snapshotAgents(tcUserId: string): Promise<AgentSnapshot[]> {
  const agents = await prisma.agent.findMany({
    where: { tcUserId },
    orderBy: { name: "asc" },
  });
  return agents.map((agent) => ({
    agentId: agent.id,
    code: agent.code,
    name: agent.name,
    district: agent.geoDistrict,
    sector: agent.geoSector,
    status:
      agent.status === "PendingVerification"
        ? "Pending verification"
        : agent.status,
    compliance: agent.compliance,
    lastVisitAt: agent.lastVisitAt?.toISOString(),
    recruitedThisMonth: agent.recruitedThisMonth,
    reactivatedThisMonth: agent.reactivatedThisMonth,
  }));
}

/**
 * Compute KPI actuals for a TC + period from visits + COAP tables.
 * Sensitization / training / meeting entities are not yet persisted → 0.
 */
export async function computeKpis(
  tcUserId: string,
  period: string,
): Promise<Record<string, number>> {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const [
    visits,
    agents,
    leads,
    activities,
    onboardingDone,
    sales,
    feedbackOpen,
  ] = await Promise.all([
    prisma.visit.findMany({
      where: {
        tcUserId,
        startedAt: { gte: start, lt: end },
      },
      select: { agentId: true },
    }),
    prisma.agent.findMany({
      where: { tcUserId },
      select: {
        recruitedThisMonth: true,
        reactivatedThisMonth: true,
        clientsRegistered: true,
      },
    }),
    prisma.lead.count({
      where: {
        tcUserId,
        createdAt: { gte: start, lt: end },
      },
    }),
    prisma.fieldActivity.findMany({
      where: {
        tcUserId,
        date: { gte: start, lt: end },
      },
      select: { peopleReached: true },
    }),
    prisma.onboardingCase.count({
      where: {
        tcUserId,
        status: "completed",
        completedAt: { gte: start, lt: end },
      },
    }),
    prisma.sale.count({
      where: {
        tcUserId,
        soldAt: { gte: start, lt: end },
      },
    }),
    prisma.communityFeedback.count({
      where: {
        tcUserId,
        status: { in: ["open", "acknowledged"] },
      },
    }),
  ]);

  const uniqueAgents = new Set(visits.map((v) => v.agentId));
  const activityPeople = activities.reduce(
    (sum, item) => sum + item.peopleReached,
    0,
  );

  return {
    totalVisits: visits.length,
    uniqueAgentsVisited: uniqueAgents.size,
    sensitizationEvents: 0,
    peopleReached: activityPeople,
    trainingSessions: 0,
    agentsTrained: 0,
    meetings: 0,
    newAgents: agents.filter((a) => a.recruitedThisMonth).length,
    reactivatedAgents: agents.filter((a) => a.reactivatedThisMonth).length,
    newClients: agents.reduce(
      (sum, a) =>
        sum + (a.clientsRegistered > 0 ? Math.min(a.clientsRegistered, 5) : 0),
      0,
    ),
    coapLeads: leads,
    coapActivities: activities.length,
    coapOnboardingCompleted: onboardingDone,
    coapSales: sales,
    coapFeedbackOpen: feedbackOpen,
  };
}

export async function getFilterOptions(viewer: AuthUser) {
  const where: Prisma.MonthlyReportWhereInput = {};
  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      periods: [],
      statuses: [],
      coordinators: [],
      targets: DEFAULT_KPI_TARGETS,
    };
  }

  const [periods, coordinators] = await Promise.all([
    prisma.monthlyReport.findMany({
      where,
      select: { period: true },
      distinct: ["period"],
      orderBy: { period: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "TERRITORY_COORDINATOR", status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    periods: periods.map((p) => p.period),
    statuses: [
      "draft",
      "submitted",
      "under_review",
      "changes_requested",
      "resubmitted",
      "reviewed",
      "evaluated",
    ],
    coordinators,
    targets: DEFAULT_KPI_TARGETS,
  };
}

export async function listReports(
  query: ReportListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicReport[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.MonthlyReportWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.status) where.status = query.status;
  if (query.period) where.period = query.period;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { period: { contains: query.search, mode: "insensitive" } },
      { status: { equals: query.search as ReportStatus } },
      { tcUser: { name: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const total = await prisma.monthlyReport.count({ where });
  const rows = await prisma.monthlyReport.findMany({
    where,
    include: { tcUser: { select: { name: true } } },
    orderBy: [{ period: "desc" }, { tcUserId: "asc" }],
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map(toPublic),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getWorkspace(id: string, viewer: AuthUser) {
  const report = await prisma.monthlyReport.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!report) throw errors.notFound("Monthly report not found");
  assertCanView(report.tcUserId, viewer);

  const publicReport = toPublic(report);
  let mapping = publicReport.agentMappingSnapshot;
  if (
    mapping.length === 0 ||
    report.status === "draft" ||
    report.status === "changes_requested"
  ) {
    mapping = await snapshotAgents(report.tcUserId);
  }

  const [y, m] = report.period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));

  const visitsCount = await prisma.visit.count({
    where: {
      tcUserId: report.tcUserId,
      startedAt: { gte: start, lt: end },
    },
  });

  const history = publicReport.history.slice().reverse();
  const userIds = Array.from(new Set(history.map((h) => h.byUserId)));
  const users =
    userIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return {
    report: { ...publicReport, agentMappingSnapshot: mapping },
    targets: DEFAULT_KPI_TARGETS,
    linkedActivities: {
      visits: visitsCount,
      sensitizations: [] as unknown[],
      trainings: [] as unknown[],
      meetings: [] as unknown[],
      actionItems: [] as unknown[],
    },
    canEdit: canEdit(report, viewer),
    canRequestChanges:
      canReview(viewer.role) &&
      (report.status === "submitted" ||
        report.status === "resubmitted" ||
        report.status === "under_review"),
    historyEnriched: history.map((event) => ({
      id: event.id,
      at: event.at,
      byName: nameById.get(event.byUserId) ?? event.byUserId,
      action: event.action,
      notes: event.notes,
      status: event.status,
    })),
  };
}

export async function createReport(
  input: ReportCreateInput,
  viewer: AuthUser,
): Promise<PublicReport> {
  let tcUserId = input.tcUserId;
  if (viewer.role === "TERRITORY_COORDINATOR") {
    tcUserId = viewer.id;
  } else if (viewer.role === "ADMIN" || viewer.role === "OPERATIONS_MANAGER") {
    if (!tcUserId) throw errors.badRequest("tcUserId is required");
  } else {
    throw errors.forbidden();
  }

  const tc = await prisma.user.findFirst({
    where: {
      id: tcUserId,
      role: "TERRITORY_COORDINATOR",
      status: "active",
    },
  });
  if (!tc) throw errors.badRequest("Invalid territory coordinator");

  const existing = await prisma.monthlyReport.findUnique({
    where: {
      tcUserId_period: { tcUserId: tcUserId!, period: input.period },
    },
    include: { tcUser: { select: { name: true } } },
  });
  if (existing) return toPublic(existing);

  const [kpiActuals, territorySnapshot] = await Promise.all([
    computeKpis(tcUserId!, input.period),
    territoryNamesForTc(tcUserId!),
  ]);

  const now = new Date();
  const id = `report-${input.period}-${tcUserId}`;
  const created = await prisma.monthlyReport.create({
    data: {
      id,
      tcUserId: tcUserId!,
      period: input.period,
      status: "draft",
      deadline: periodDeadline(input.period),
      territorySnapshotJson: territorySnapshot,
      kpiActualsJson: kpiActuals,
      narrativeJson: EMPTY_NARRATIVE,
      agentSnapshotJson: [],
      historyJson: [
        {
          id: `rh-${Date.now()}`,
          at: now.toISOString(),
          byUserId: viewer.id,
          action: "save_draft",
          status: "draft",
          notes: "Report draft created.",
        },
      ],
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ reportId: created.id, period: input.period }, "Monthly report created");
  return toPublic(created);
}

export async function saveDraft(
  id: string,
  input: ReportDraftInput,
  viewer: AuthUser,
): Promise<PublicReport> {
  const report = await prisma.monthlyReport.findUnique({ where: { id } });
  if (!report) throw errors.notFound("Monthly report not found");
  if (!canEdit(report, viewer)) {
    throw errors.forbidden("You cannot edit this report");
  }

  const now = new Date();
  const updated = await prisma.monthlyReport.update({
    where: { id },
    data: {
      narrativeJson: input.narrative,
      ...(input.kpiActuals
        ? { kpiActualsJson: input.kpiActuals }
        : {}),
      historyJson: appendHistory(report.historyJson, {
        id: `rh-${Date.now()}`,
        at: now.toISOString(),
        byUserId: viewer.id,
        action: "save_draft",
        status: report.status,
        notes: "Draft saved.",
      }),
    },
    include: { tcUser: { select: { name: true } } },
  });

  return toPublic(updated);
}

export async function refreshKpis(
  id: string,
  viewer: AuthUser,
): Promise<PublicReport> {
  const report = await prisma.monthlyReport.findUnique({ where: { id } });
  if (!report) throw errors.notFound("Monthly report not found");
  if (!canEdit(report, viewer)) {
    throw errors.forbidden("Report is not editable");
  }

  const kpiActuals = await computeKpis(report.tcUserId, report.period);
  const updated = await prisma.monthlyReport.update({
    where: { id },
    data: { kpiActualsJson: kpiActuals },
    include: { tcUser: { select: { name: true } } },
  });
  return toPublic(updated);
}

export async function submitReport(
  id: string,
  viewer: AuthUser,
): Promise<PublicReport> {
  const report = await prisma.monthlyReport.findUnique({ where: { id } });
  if (!report) throw errors.notFound("Monthly report not found");
  if (!canEdit(report, viewer)) {
    throw errors.forbidden("You cannot submit this report");
  }

  const narrative = asNarrative(report.narrativeJson);
  const missing = NARRATIVE_KEYS.filter((key) => !narrative[key]?.trim());
  if (missing.length > 0) {
    throw errors.badRequest(
      `Complete narrative sections before submit (${missing.map((k) => k.toUpperCase()).join(", ")})`,
    );
  }

  const now = new Date();
  const nextStatus: ReportStatus =
    report.status === "changes_requested" ? "resubmitted" : "submitted";
  const mapping = await snapshotAgents(report.tcUserId);

  const updated = await prisma.monthlyReport.update({
    where: { id },
    data: {
      status: nextStatus,
      submittedAt: now,
      agentSnapshotJson: mapping,
      historyJson: appendHistory(report.historyJson, {
        id: `rh-${Date.now()}`,
        at: now.toISOString(),
        byUserId: viewer.id,
        action: nextStatus === "resubmitted" ? "resubmit" : "submit",
        status: nextStatus,
        notes:
          nextStatus === "resubmitted"
            ? "Resubmitted after changes requested."
            : "Submitted for Head Office review.",
      }),
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ reportId: id, status: nextStatus }, "Monthly report submitted");
  return toPublic(updated);
}

export async function requestChanges(
  id: string,
  notes: string,
  viewer: AuthUser,
): Promise<PublicReport> {
  if (!canReview(viewer.role)) {
    throw errors.forbidden("Not authorized to request changes");
  }

  const report = await prisma.monthlyReport.findUnique({ where: { id } });
  if (!report) throw errors.notFound("Monthly report not found");
  if (
    report.status !== "submitted" &&
    report.status !== "resubmitted" &&
    report.status !== "under_review"
  ) {
    throw errors.badRequest(
      "Only submitted reports can be sent back for changes",
    );
  }

  const now = new Date();
  const updated = await prisma.monthlyReport.update({
    where: { id },
    data: {
      status: "changes_requested",
      reviewNotes: notes,
      historyJson: appendHistory(report.historyJson, {
        id: `rh-${Date.now()}`,
        at: now.toISOString(),
        byUserId: viewer.id,
        action: "request_changes",
        status: "changes_requested",
        notes,
      }),
    },
    include: { tcUser: { select: { name: true } } },
  });

  return toPublic(updated);
}
