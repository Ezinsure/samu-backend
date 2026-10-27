import type {
  FraudFlag,
  FraudSeverity,
  FraudStatus,
  Prisma,
  Visit,
  VisitValidation,
} from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import type { FraudListQuery, FraudReviewInput } from "./fraud.schemas.js";

type ReviewEvent = {
  id: string;
  at: string;
  byUserId: string;
  action: "accept" | "escalate" | "dismiss" | "note";
  notes?: string;
};

export type PublicFraudListItem = {
  id: string;
  visitId: string;
  type: string;
  severity: FraudSeverity;
  status: FraudStatus;
  detectedAt: string;
  notes?: string;
  resolution?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  assignedReviewerId?: string;
  reviewHistory?: ReviewEvent[];
  agentName: string;
  agentCode: string;
  agentId: string;
  tcName: string;
  tcUserId: string;
  visitPurpose: string;
  visitStartedAt: string;
  visitValidation: VisitValidation;
  distanceFromRegisteredMeters: number;
  photoCount: number;
};

function canViewFraud(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "MD_VIEWER"
  );
}

function canReviewFraud(role: AuthUser["role"]): boolean {
  return role === "ADMIN" || role === "OPERATIONS_MANAGER";
}

function parseHistory(json: Prisma.JsonValue): ReviewEvent[] {
  if (!Array.isArray(json)) return [];
  return json as ReviewEvent[];
}

function enrich(
  flag: FraudFlag & {
    visit: Visit & {
      agent: { id: string; name: string; code: string };
      tcUser: { name: string };
      photos: { id: string }[];
    };
    reviewedBy?: { name: string } | null;
    assignedReviewer?: { name: string } | null;
  },
): PublicFraudListItem {
  return {
    id: flag.id,
    visitId: flag.visitId,
    type: flag.type,
    severity: flag.severity,
    status: flag.status,
    detectedAt: flag.detectedAt.toISOString(),
    notes: flag.notes ?? undefined,
    resolution: flag.resolution ?? undefined,
    reviewedAt: flag.reviewedAt?.toISOString(),
    reviewedByUserId: flag.reviewedByUserId ?? undefined,
    assignedReviewerId: flag.assignedReviewerId ?? undefined,
    reviewHistory: parseHistory(flag.reviewHistoryJson),
    agentName: flag.visit.agent.name,
    agentCode: flag.visit.agent.code,
    agentId: flag.visit.agent.id,
    tcName: flag.visit.tcUser.name,
    tcUserId: flag.visit.tcUserId,
    visitPurpose: flag.visit.purpose,
    visitStartedAt: flag.visit.startedAt.toISOString(),
    visitValidation: flag.visit.validation,
    distanceFromRegisteredMeters: flag.visit.distanceFromRegisteredMeters,
    photoCount: flag.visit.photos.length,
  };
}

const visitInclude = {
  agent: { select: { id: true, name: true, code: true } },
  tcUser: { select: { name: true } },
  photos: { select: { id: true } },
} as const;

export async function getFilterOptions(viewer: AuthUser) {
  if (!canViewFraud(viewer.role)) {
    throw errors.forbidden();
  }

  const types = await prisma.fraudFlag.findMany({
    select: { type: true },
    distinct: ["type"],
    orderBy: { type: "asc" },
  });

  return {
    types: types.map((t) => t.type),
    statuses: ["open", "escalated", "resolved", "dismissed"] as const,
    severities: ["low", "medium", "high"] as const,
  };
}

export async function listFlags(
  query: FraudListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicFraudListItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  if (!canViewFraud(viewer.role)) {
    throw errors.forbidden();
  }

  const where: Prisma.FraudFlagWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.type) where.type = query.type;
  if (query.search) {
    where.OR = [
      { type: { contains: query.search, mode: "insensitive" } },
      { notes: { contains: query.search, mode: "insensitive" } },
      {
        visit: {
          agent: { name: { contains: query.search, mode: "insensitive" } },
        },
      },
      {
        visit: {
          agent: { code: { contains: query.search, mode: "insensitive" } },
        },
      },
      {
        visit: {
          tcUser: { name: { contains: query.search, mode: "insensitive" } },
        },
      },
    ];
  }

  const total = await prisma.fraudFlag.count({ where });

  // Fetch a wider window then sort by status rank (open → escalated → closed).
  const rows = await prisma.fraudFlag.findMany({
    where,
    include: {
      visit: { include: visitInclude },
      reviewedBy: { select: { name: true } },
      assignedReviewer: { select: { name: true } },
    },
  });

  const rank = (status: FraudStatus) => {
    if (status === "open") return 0;
    if (status === "escalated") return 1;
    if (status === "resolved") return 2;
    return 3;
  };

  rows.sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    return b.detectedAt.getTime() - a.detectedAt.getTime();
  });

  const pageRows = rows.slice(
    (query.page - 1) * query.pageSize,
    query.page * query.pageSize,
  );

  return {
    data: pageRows.map(enrich),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getFlagDetail(id: string, viewer: AuthUser) {
  if (!canViewFraud(viewer.role)) {
    throw errors.forbidden();
  }

  const flag = await prisma.fraudFlag.findUnique({
    where: { id },
    include: {
      visit: {
        include: {
          ...visitInclude,
          photos: true,
        },
      },
      reviewedBy: { select: { id: true, name: true } },
      assignedReviewer: { select: { id: true, name: true } },
    },
  });
  if (!flag) throw errors.notFound("Fraud flag not found");

  const history = parseHistory(flag.reviewHistoryJson);
  const reviewerIds = Array.from(
    new Set(history.map((e) => e.byUserId).filter(Boolean)),
  );
  const reviewers =
    reviewerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(reviewers.map((u) => [u.id, u.name]));

  const listItem = enrich(flag);

  return {
    ...listItem,
    visit: {
      id: flag.visit.id,
      agentId: flag.visit.agentId,
      tcUserId: flag.visit.tcUserId,
      startedAt: flag.visit.startedAt.toISOString(),
      endedAt: flag.visit.endedAt.toISOString(),
      durationMinutes: flag.visit.durationMinutes,
      purpose: flag.visit.purpose,
      activities: flag.visit.activities,
      outcome: flag.visit.outcome,
      location: {
        lat: flag.visit.lat,
        lng: flag.visit.lng,
        accuracyMeters: flag.visit.accuracyMeters ?? undefined,
      },
      distanceFromRegisteredMeters: flag.visit.distanceFromRegisteredMeters,
      validation: flag.visit.validation,
      confirmationStatus: flag.visit.confirmationStatus,
      photoCount: flag.visit.photos.length,
      challenges: flag.visit.challenges ?? undefined,
      supportNeeded: flag.visit.supportNeeded ?? undefined,
      flaggedReason: flag.visit.flaggedReason ?? undefined,
    },
    reviewerName: flag.reviewedBy?.name,
    assignedReviewerName: flag.assignedReviewer?.name,
    reviewHistoryEnriched: history.map((event) => ({
      ...event,
      byName: nameById.get(event.byUserId) ?? event.byUserId,
    })),
  };
}

/**
 * Accept / escalate / dismiss a fraud flag.
 * Accept & dismiss clear the linked visit to `accepted`; escalate raises severity.
 */
export async function reviewFlag(
  id: string,
  input: FraudReviewInput,
  viewer: AuthUser,
): Promise<PublicFraudListItem> {
  if (!canReviewFraud(viewer.role)) {
    throw errors.forbidden("Not authorized to review fraud flags");
  }

  const flag = await prisma.fraudFlag.findUnique({
    where: { id },
    include: { visit: true },
  });
  if (!flag) throw errors.notFound("Fraud flag not found");

  if (flag.visit.tcUserId === viewer.id) {
    throw errors.forbidden(
      "You cannot review a flag on your own visit submission",
    );
  }

  if (flag.status === "resolved" || flag.status === "dismissed") {
    throw errors.badRequest("This flag has already been closed");
  }

  const now = new Date();
  const event: ReviewEvent = {
    id: `freview-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    at: now.toISOString(),
    byUserId: viewer.id,
    action: input.action,
    notes: input.notes,
  };

  let nextStatus: FraudStatus = flag.status;
  let nextSeverity: FraudSeverity = flag.severity;
  let nextVisitValidation: VisitValidation | undefined;
  let clearFlaggedReason = false;
  let assignSelf = false;

  if (input.action === "accept") {
    nextStatus = "resolved";
    nextVisitValidation = "accepted";
    clearFlaggedReason = true;
  } else if (input.action === "dismiss") {
    nextStatus = "dismissed";
    nextVisitValidation = "accepted";
    clearFlaggedReason = true;
  } else {
    nextStatus = "escalated";
    nextSeverity = "high";
    assignSelf = true;
  }

  const history = [...parseHistory(flag.reviewHistoryJson), event];

  // Sequential `$transaction([...])` — Neon’s PgBouncer pooler drops interactive txs.
  const [updated] = await prisma.$transaction([
    prisma.fraudFlag.update({
      where: { id },
      data: {
        status: nextStatus,
        severity: nextSeverity,
        resolution: input.notes,
        reviewedAt: now,
        reviewedByUserId: viewer.id,
        assignedReviewerId: assignSelf
          ? viewer.id
          : flag.assignedReviewerId,
        reviewHistoryJson: history,
      },
      include: {
        visit: { include: visitInclude },
        reviewedBy: { select: { name: true } },
        assignedReviewer: { select: { name: true } },
      },
    }),
    ...(nextVisitValidation
      ? [
          prisma.visit.update({
            where: { id: flag.visitId },
            data: {
              validation: nextVisitValidation,
              flaggedReason: clearFlaggedReason ? null : undefined,
            },
          }),
        ]
      : []),
  ]);

  // Keep the embedded visit in sync with the visit row we just patched.
  if (nextVisitValidation) {
    updated.visit.validation = nextVisitValidation;
    if (clearFlaggedReason) updated.visit.flaggedReason = null;
  }

  logger.info(
    { flagId: id, action: input.action, status: nextStatus },
    "Fraud flag reviewed",
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: `fraud.${input.action}`,
    objectType: "fraud_flag",
    objectId: id,
    summary: `Fraud flag ${id} ${input.action} → ${nextStatus}.`,
  });

  return enrich(updated);
}
