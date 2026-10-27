import type {
  FraudFlag,
  Prisma,
  Visit,
  VisitPhoto,
  VisitValidation,
} from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { distanceMeters, evaluateGpsValidation } from "../../lib/gps.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { getGpsThresholdMeters } from "../../lib/settings.js";
import { getSignedPhotoUrl, uploadVisitPhoto } from "../../lib/storage.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type {
  VisitCreateInput,
  VisitListQuery,
  VisitPatchInput,
} from "./visits.schemas.js";
import { VISIT_PURPOSES } from "./visits.schemas.js";

export type PublicVisitPhoto = {
  id: string;
  name: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  url?: string;
};

export type PublicVisit = {
  id: string;
  agentId: string;
  tcUserId: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  purpose: string;
  activities: string;
  outcome: string;
  location: { lat: number; lng: number; accuracyMeters?: number };
  distanceFromRegisteredMeters: number;
  validation: VisitValidation;
  confirmationStatus: Visit["confirmationStatus"];
  photoCount: number;
  challenges?: string;
  supportNeeded?: string;
  flaggedReason?: string;
  checklist?: unknown;
  photos?: PublicVisitPhoto[];
  deviceInfo?: string;
  serviceLines?: string[];
  agentName?: string;
  agentCode?: string;
  agentDistrict?: string;
  tcName?: string;
};

function canCapture(role: AuthUser["role"]): boolean {
  return role === "ADMIN" || role === "TERRITORY_COORDINATOR";
}

function canPatch(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

function assertCanView(visitTcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && visitTcUserId === viewer.id) {
    return;
  }
  throw errors.forbidden();
}

function toPublicPhoto(
  photo: VisitPhoto,
  url?: string,
): PublicVisitPhoto {
  return {
    id: photo.id,
    name: photo.fileName,
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes,
    storageKey: photo.storageKey,
    url,
  };
}

function toPublicVisit(
  visit: Visit & {
    photos?: VisitPhoto[];
    agent?: { name: string; code: string; geoDistrict: string };
    tcUser?: { name: string };
  },
  photoUrls?: Map<string, string>,
): PublicVisit {
  const photos = visit.photos?.map((p) =>
    toPublicPhoto(p, photoUrls?.get(p.id)),
  );
  return {
    id: visit.id,
    agentId: visit.agentId,
    tcUserId: visit.tcUserId,
    startedAt: visit.startedAt.toISOString(),
    endedAt: visit.endedAt.toISOString(),
    durationMinutes: visit.durationMinutes,
    purpose: visit.purpose,
    activities: visit.activities,
    outcome: visit.outcome,
    location: {
      lat: visit.lat,
      lng: visit.lng,
      accuracyMeters: visit.accuracyMeters ?? undefined,
    },
    distanceFromRegisteredMeters: visit.distanceFromRegisteredMeters,
    validation: visit.validation,
    confirmationStatus: visit.confirmationStatus,
    photoCount: photos?.length ?? 0,
    challenges: visit.challenges ?? undefined,
    supportNeeded: visit.supportNeeded ?? undefined,
    flaggedReason: visit.flaggedReason ?? undefined,
    checklist: visit.checklistJson ?? undefined,
    photos,
    deviceInfo: visit.deviceInfo ?? undefined,
    serviceLines: Array.isArray(visit.serviceLinesJson)
      ? (visit.serviceLinesJson as string[])
      : undefined,
    agentName: visit.agent?.name,
    agentCode: visit.agent?.code,
    agentDistrict: visit.agent?.geoDistrict,
    tcName: visit.tcUser?.name,
  };
}

function toPublicFraud(flag: FraudFlag) {
  return {
    id: flag.id,
    type: flag.type,
    severity: flag.severity,
    status: flag.status,
    detectedAt: flag.detectedAt.toISOString(),
    notes: flag.notes ?? undefined,
    resolution: flag.resolution ?? undefined,
  };
}

/**
 * Upload a single visit photo to MinIO; returns storage metadata for createVisit.
 */
export async function uploadPhoto(
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  viewer: AuthUser,
): Promise<{
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}> {
  if (!canCapture(viewer.role)) {
    throw errors.forbidden("Not allowed to upload visit photos");
  }
  if (!file.mimetype.startsWith("image/")) {
    throw errors.badRequest("Only image uploads are allowed");
  }
  if (file.size > 10_000_000) {
    throw errors.badRequest("Photo must be ≤ 10 MB");
  }

  const uploaded = await uploadVisitPhoto({
    uploaderUserId: viewer.id,
    fileName: file.originalname || "photo.jpg",
    contentType: file.mimetype,
    body: file.buffer,
  });

  return {
    storageKey: uploaded.storageKey,
    fileName: file.originalname || "photo.jpg",
    contentType: uploaded.contentType,
    sizeBytes: uploaded.sizeBytes,
  };
}

export async function getFilterOptions(viewer: AuthUser) {
  const agentWhere: Prisma.AgentWhereInput = {};
  if (viewer.role === "TERRITORY_COORDINATOR") {
    agentWhere.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      agents: [],
      coordinators: [],
      purposes: [...VISIT_PURPOSES],
      validations: ["accepted", "flagged", "rejected"],
      confirmations: [
        "pending",
        "confirmed",
        "disputed",
        "expired",
        "delivery_failed",
      ],
      gpsThresholdMeters: await getGpsThresholdMeters(),
    };
  }

  const [agents, coordinators] = await Promise.all([
    prisma.agent.findMany({
      where: { ...agentWhere, status: "Active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.user.findMany({
      where: { role: "TERRITORY_COORDINATOR", status: "active" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    agents,
    coordinators,
    purposes: [...VISIT_PURPOSES],
    validations: ["accepted", "flagged", "rejected"] as const,
    confirmations: [
      "pending",
      "confirmed",
      "disputed",
      "expired",
      "delivery_failed",
    ] as const,
    gpsThresholdMeters: await getGpsThresholdMeters(),
  };
}

export async function listVisits(
  query: VisitListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicVisit[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.VisitWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.agentId) where.agentId = query.agentId;
  if (query.validation) where.validation = query.validation;
  if (query.confirmation) where.confirmationStatus = query.confirmation;
  if (query.purpose) where.purpose = query.purpose;
  if (query.search) {
    where.OR = [
      { purpose: { contains: query.search, mode: "insensitive" } },
      { activities: { contains: query.search, mode: "insensitive" } },
      { outcome: { contains: query.search, mode: "insensitive" } },
      { agent: { name: { contains: query.search, mode: "insensitive" } } },
      { agent: { code: { contains: query.search, mode: "insensitive" } } },
      { agent: { geoDistrict: { contains: query.search, mode: "insensitive" } } },
    ];
  }

  const total = await prisma.visit.count({ where });
  const rows = await prisma.visit.findMany({
    where,
    include: {
      photos: true,
      agent: { select: { name: true, code: true, geoDistrict: true } },
      tcUser: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => toPublicVisit(row)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

export async function getVisitDetail(id: string, viewer: AuthUser) {
  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      agent: true,
      tcUser: { select: { name: true } },
      fraudFlags: { orderBy: { detectedAt: "desc" } },
    },
  });
  if (!visit) throw errors.notFound("Visit not found");
  assertCanView(visit.tcUserId, viewer);

  const photoUrls = new Map<string, string>();
  await Promise.all(
    visit.photos.map(async (photo) => {
      try {
        const url = await getSignedPhotoUrl(photo.storageKey);
        photoUrls.set(photo.id, url);
      } catch {
        // Seed photos may not exist in MinIO — omit url.
      }
    }),
  );

  const publicVisit = toPublicVisit(
    {
      ...visit,
      agent: {
        name: visit.agent.name,
        code: visit.agent.code,
        geoDistrict: visit.agent.geoDistrict,
      },
    },
    photoUrls,
  );

  return {
    ...publicVisit,
    agent: {
      id: visit.agent.id,
      code: visit.agent.code,
      name: visit.agent.name,
      phone: visit.agent.phone,
      email: visit.agent.email ?? undefined,
      status: visit.agent.status,
      geo: {
        province: visit.agent.geoProvince,
        district: visit.agent.geoDistrict,
        sector: visit.agent.geoSector,
        cell: visit.agent.geoCell,
      },
      registeredLocation: {
        lat: visit.agent.lat,
        lng: visit.agent.lng,
        accuracyMeters: visit.agent.accuracyMeters ?? undefined,
      },
      tcUserId: visit.agent.tcUserId,
      services: visit.agent.servicesJson,
      lastVisitAt: visit.agent.lastVisitAt?.toISOString(),
      compliance: visit.agent.compliance,
    },
    fraudFlags: visit.fraudFlags.map(toPublicFraud),
    gpsThresholdMeters: await getGpsThresholdMeters(),
  };
}

/**
 * Create a field visit. Server recomputes GPS distance vs agent registered location.
 * Flagged visits open a FraudFlag (GPS mismatch). Supports Idempotency-Key.
 */
export async function createVisit(
  input: VisitCreateInput,
  viewer: AuthUser,
  idempotencyKey?: string,
): Promise<PublicVisit> {
  if (!canCapture(viewer.role)) {
    throw errors.forbidden("Not allowed to capture visits");
  }

  if (idempotencyKey) {
    const existing = await prisma.visit.findUnique({
      where: { idempotencyKey },
      include: {
        photos: true,
        agent: { select: { name: true, code: true, geoDistrict: true } },
        tcUser: { select: { name: true } },
      },
    });
    if (existing) return toPublicVisit(existing);
  }

  const agent = await prisma.agent.findUnique({ where: { id: input.agentId } });
  if (!agent) throw errors.badRequest("Selected agent was not found");

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    agent.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("You can only visit agents assigned to you");
  }

  if (
    input.checklist.internetAvailable &&
    !input.checklist.internetType?.trim()
  ) {
    throw errors.badRequest(
      "Select an internet type when internet is available",
    );
  }

  const started = new Date(input.startedAt);
  const ended = new Date(input.endedAt);
  if (
    !Number.isFinite(started.getTime()) ||
    !Number.isFinite(ended.getTime()) ||
    ended < started
  ) {
    throw errors.badRequest("Visit timestamps are invalid");
  }

  const durationMinutes = Math.max(
    1,
    Math.round((ended.getTime() - started.getTime()) / 60_000),
  );

  const distance = Math.round(
    distanceMeters(
      { lat: input.location.lat, lng: input.location.lng },
      { lat: agent.lat, lng: agent.lng },
    ),
  );
  const threshold = await getGpsThresholdMeters();
  const gps = evaluateGpsValidation(distance, threshold);

  const tcUserId =
    viewer.role === "TERRITORY_COORDINATOR" ? viewer.id : agent.tcUserId;
  const id = `visit-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const fraudId =
    gps.validation === "flagged"
      ? `fraud-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      : null;

  // Sequential `$transaction([...])` — not the interactive callback form.
  // Neon’s PgBouncer pooler drops interactive transactions (Prisma P2028).
  const [visit] = await prisma.$transaction([
    prisma.visit.create({
      data: {
        id,
        agentId: agent.id,
        tcUserId,
        purpose: input.purpose,
        startedAt: started,
        endedAt: ended,
        durationMinutes,
        activities: input.activities,
        outcome: input.outcome,
        lat: input.location.lat,
        lng: input.location.lng,
        accuracyMeters: input.location.accuracyMeters ?? null,
        distanceFromRegisteredMeters: distance,
        validation: gps.validation,
        confirmationStatus: "pending",
        challenges: input.challenges ?? null,
        supportNeeded: input.supportNeeded ?? null,
        flaggedReason: gps.flaggedReason ?? null,
        checklistJson: input.checklist,
        serviceLinesJson: input.serviceLines?.length
          ? input.serviceLines
          : undefined,
        deviceInfo: input.deviceInfo ?? null,
        idempotencyKey: idempotencyKey ?? null,
        photos: {
          create: input.photos.map((photo) => ({
            storageKey: photo.storageKey,
            fileName: photo.fileName,
            contentType: photo.contentType,
            sizeBytes: photo.sizeBytes,
          })),
        },
      },
      include: {
        photos: true,
        agent: { select: { name: true, code: true, geoDistrict: true } },
        tcUser: { select: { name: true } },
      },
    }),
    prisma.agent.update({
      where: { id: agent.id },
      data: {
        lastVisitAt: ended,
        compliance: "green",
        servicesJson: input.checklist,
      },
    }),
    ...(fraudId
      ? [
          prisma.fraudFlag.create({
            data: {
              id: fraudId,
              visitId: id,
              type: "GPS mismatch",
              severity: "high",
              status: "open",
              detectedAt: ended,
              notes:
                gps.flaggedReason ??
                `Visit captured ${distance}m from registered location.`,
              reviewHistoryJson: [],
            },
          }),
        ]
      : []),
  ]);

  logger.info(
    {
      visitId: visit.id,
      agentId: agent.id,
      validation: visit.validation,
      distance,
    },
    "Visit created",
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: "visit.create",
    objectType: "visit",
    objectId: visit.id,
    summary: `Visit ${visit.id} created for agent ${agent.id} (${visit.validation}, ${distance}m / ${threshold}m).`,
  });

  return toPublicVisit(visit);
}

/**
 * Limited patch: confirmation / validation adjustments (Admin/Ops/owning TC).
 */
export async function patchVisit(
  id: string,
  input: VisitPatchInput,
  viewer: AuthUser,
): Promise<PublicVisit> {
  if (!canPatch(viewer.role)) {
    throw errors.forbidden();
  }

  const existing = await prisma.visit.findUnique({ where: { id } });
  if (!existing) throw errors.notFound("Visit not found");

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden();
  }

  if (viewer.role === "TERRITORY_COORDINATOR") {
    // TCs may only update confirmation-adjacent narrative fields, not validation.
    if (input.validation !== undefined) {
      throw errors.forbidden("TCs cannot change visit validation");
    }
  }

  const updated = await prisma.visit.update({
    where: { id },
    data: {
      confirmationStatus: input.confirmationStatus,
      validation: input.validation,
      flaggedReason: input.flaggedReason,
      challenges: input.challenges,
      supportNeeded: input.supportNeeded,
    },
    include: {
      photos: true,
      agent: { select: { name: true, code: true, geoDistrict: true } },
      tcUser: { select: { name: true } },
    },
  });

  return toPublicVisit(updated);
}

/** Recent visits for an agent (used by agent detail). */
export async function listRecentForAgent(
  agentId: string,
  take = 10,
): Promise<PublicVisit[]> {
  const rows = await prisma.visit.findMany({
    where: { agentId },
    include: {
      photos: true,
      agent: { select: { name: true, code: true, geoDistrict: true } },
      tcUser: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
    take,
  });
  return rows.map((row) => toPublicVisit(row));
}
