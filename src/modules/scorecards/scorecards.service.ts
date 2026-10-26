import type { Prisma, Scorecard, ScorecardStatus } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import {
  SCORECARD_CRITERIA,
  calculateWeightedTotal,
  decisionFromApi,
  decisionToApi,
  suggestDecision,
  type CriterionScore,
} from "../../lib/reporting.js";
import type { AuthUser } from "../../types/express.js";
import type {
  ScorecardDraftInput,
  ScorecardListQuery,
} from "./scorecards.schemas.js";

export type PublicScorecard = {
  id: string;
  monthlyReportId: string;
  tcUserId: string;
  period: string;
  status: ScorecardStatus;
  templateVersion: string;
  criteria: CriterionScore[];
  overallComment: string;
  decision?: string;
  weightedTotal: number;
  evaluatorUserId?: string;
  submittedAt?: string;
  updatedAt: string;
  tcName?: string;
  evaluatorName?: string;
  suggestedDecision: string;
};

function canEvaluate(role: AuthUser["role"]): boolean {
  return role === "ADMIN" || role === "OPERATIONS_MANAGER";
}

function canView(role: AuthUser["role"]): boolean {
  return canEvaluate(role) || role === "MD_VIEWER" || role === "TERRITORY_COORDINATOR";
}

function asCriteria(json: Prisma.JsonValue): CriterionScore[] {
  return Array.isArray(json) ? (json as CriterionScore[]) : [];
}

function toPublic(
  row: Scorecard & {
    tcUser?: { name: string };
    evaluator?: { name: string } | null;
  },
): PublicScorecard {
  const criteria = asCriteria(row.criteriaJson);
  const weightedTotal = calculateWeightedTotal(criteria);
  return {
    id: row.id,
    monthlyReportId: row.monthlyReportId,
    tcUserId: row.tcUserId,
    period: row.period,
    status: row.status,
    templateVersion: row.templateVersion,
    criteria,
    overallComment: row.overallComment,
    decision: decisionToApi(row.decision),
    weightedTotal,
    evaluatorUserId: row.evaluatorUserId ?? undefined,
    submittedAt: row.submittedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    tcName: row.tcUser?.name,
    evaluatorName: row.evaluator?.name,
    suggestedDecision: decisionToApi(suggestDecision(weightedTotal))!,
  };
}

export async function listScorecards(
  query: ScorecardListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicScorecard[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  if (!canView(viewer.role)) throw errors.forbidden();

  const where: Prisma.ScorecardWhereInput = {};
  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
    // TCs only see finished evaluations (drafts are Head Office working copies).
    where.status = "submitted";
  }
  if (query.status && viewer.role !== "TERRITORY_COORDINATOR") {
    where.status = query.status;
  }
  if (query.period) where.period = query.period;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { period: { contains: query.search, mode: "insensitive" } },
      { overallComment: { contains: query.search, mode: "insensitive" } },
      { tcUser: { name: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const total = await prisma.scorecard.count({ where });
  const rows = await prisma.scorecard.findMany({
    where,
    include: {
      tcUser: { select: { name: true } },
      evaluator: { select: { name: true } },
    },
    orderBy: [{ period: "desc" }, { updatedAt: "desc" }],
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
  if (!canView(viewer.role)) throw errors.forbidden();

  const scorecard = await prisma.scorecard.findUnique({
    where: { id },
    include: {
      tcUser: { select: { name: true } },
      evaluator: { select: { name: true } },
      monthlyReport: true,
    },
  });
  if (!scorecard) throw errors.notFound("Scorecard not found");

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    scorecard.tcUserId !== viewer.id
  ) {
    throw errors.forbidden();
  }

  // TCs only see submitted scorecards for themselves.
  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    scorecard.status !== "submitted"
  ) {
    throw errors.forbidden();
  }

  const enriched = toPublic(scorecard);
  const report = scorecard.monthlyReport;

  return {
    scorecard: enriched,
    criteriaDefs: SCORECARD_CRITERIA.map((c) => ({ ...c })),
    report: {
      id: report.id,
      period: report.period,
      status: report.status,
      tcUserId: report.tcUserId,
    },
    canEdit:
      canEvaluate(viewer.role) &&
      scorecard.status === "draft",
  };
}

export async function ensureForReport(
  monthlyReportId: string,
  viewer: AuthUser,
): Promise<{ id: string }> {
  if (!canEvaluate(viewer.role)) throw errors.forbidden();

  const existing = await prisma.scorecard.findUnique({
    where: { monthlyReportId },
  });
  if (existing) return { id: existing.id };

  const report = await prisma.monthlyReport.findUnique({
    where: { id: monthlyReportId },
  });
  if (!report) throw errors.notFound("Monthly report not found");

  const allowed = [
    "submitted",
    "resubmitted",
    "under_review",
    "reviewed",
    "evaluated",
  ];
  if (!allowed.includes(report.status)) {
    throw errors.badRequest("Only submitted reports can be evaluated");
  }

  const criteria: CriterionScore[] = SCORECARD_CRITERIA.map((def) => ({
    criterionId: def.id,
    score: 3,
    comment: "",
  }));

  const id = `score-${report.period}-${report.tcUserId}`;
  const created = await prisma.scorecard.create({
    data: {
      id,
      monthlyReportId,
      tcUserId: report.tcUserId,
      period: report.period,
      status: "draft",
      templateVersion: "v1-2026",
      criteriaJson: criteria,
      overallComment: "",
      weightedTotal: calculateWeightedTotal(criteria),
      evaluatorUserId: viewer.id,
    },
  });

  logger.info({ scorecardId: created.id, monthlyReportId }, "Scorecard draft created");
  return { id: created.id };
}

export async function saveDraft(
  id: string,
  input: ScorecardDraftInput,
  viewer: AuthUser,
): Promise<PublicScorecard> {
  if (!canEvaluate(viewer.role)) {
    throw errors.forbidden("Not authorized to evaluate scorecards");
  }

  const scorecard = await prisma.scorecard.findUnique({ where: { id } });
  if (!scorecard) throw errors.notFound("Scorecard not found");
  if (scorecard.status !== "draft") {
    throw errors.badRequest("Submitted scorecards cannot be edited");
  }

  const weightedTotal = calculateWeightedTotal(input.criteria);
  const decision = input.decision
    ? decisionFromApi(input.decision)
    : scorecard.decision;

  const updated = await prisma.scorecard.update({
    where: { id },
    data: {
      criteriaJson: input.criteria,
      overallComment: input.overallComment ?? scorecard.overallComment,
      decision: decision ?? null,
      weightedTotal,
      evaluatorUserId: viewer.id,
    },
    include: {
      tcUser: { select: { name: true } },
      evaluator: { select: { name: true } },
    },
  });

  return toPublic(updated);
}

export async function submitScorecard(
  id: string,
  viewer: AuthUser,
): Promise<PublicScorecard> {
  if (!canEvaluate(viewer.role)) {
    throw errors.forbidden("Not authorized to submit scorecards");
  }

  const scorecard = await prisma.scorecard.findUnique({ where: { id } });
  if (!scorecard) throw errors.notFound("Scorecard not found");
  if (scorecard.status !== "draft") {
    throw errors.badRequest("Scorecard is already submitted");
  }

  const criteria = asCriteria(scorecard.criteriaJson);
  const incomplete = criteria.some(
    (c) => !c.score || c.score < 1 || c.score > 5,
  );
  if (incomplete || criteria.length < SCORECARD_CRITERIA.length) {
    throw errors.badRequest("Complete all criterion scores before submit");
  }

  const weightedTotal = calculateWeightedTotal(criteria);
  const decision = scorecard.decision ?? suggestDecision(weightedTotal);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.scorecard.update({
      where: { id },
      data: {
        status: "submitted",
        weightedTotal,
        decision,
        submittedAt: now,
        evaluatorUserId: viewer.id,
      },
      include: {
        tcUser: { select: { name: true } },
        evaluator: { select: { name: true } },
      },
    });

    await tx.monthlyReport.update({
      where: { id: scorecard.monthlyReportId },
      data: {
        status: "evaluated",
        reviewNotes: `Scorecard submitted: ${decisionToApi(decision)}`,
      },
    });

    return next;
  });

  logger.info(
    { scorecardId: id, decision, weightedTotal },
    "Scorecard submitted",
  );
  return toPublic(updated);
}
