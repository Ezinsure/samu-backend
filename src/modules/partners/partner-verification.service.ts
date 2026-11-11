import { randomUUID } from "node:crypto";
import type { PartnerVerificationStatus, Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import { PARTNER_EZINSURE } from "./partners.schemas.js";
import {
  getEzinsureVerifyContract,
  resolveEzinsureVerifier,
  type PartnerVerifyResult,
} from "./partner-verifier.js";

function assertAdmin(viewer: AuthUser) {
  if (viewer.role !== "ADMIN") throw errors.forbidden();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublicRun(run: {
  id: string;
  partnerKey: string;
  triggeredByUserId: string;
  scope: string;
  status: string;
  applicantIds: string[];
  month: string | null;
  totalCount: number;
  processedCount: number;
  verifiedCount: number;
  notFoundCount: number;
  errorCount: number;
  skippedCount: number;
  adapter: string;
  lastError: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  triggeredBy?: { id: string; name: string; email: string } | null;
}) {
  const percent =
    run.totalCount > 0
      ? Math.min(100, Math.round((run.processedCount / run.totalCount) * 100))
      : run.status === "completed"
        ? 100
        : 0;

  return {
    id: run.id,
    partnerKey: run.partnerKey,
    triggeredByUserId: run.triggeredByUserId,
    scope: run.scope,
    status: run.status,
    applicantIds: run.applicantIds,
    month: run.month ?? undefined,
    totalCount: run.totalCount,
    processedCount: run.processedCount,
    verifiedCount: run.verifiedCount,
    notFoundCount: run.notFoundCount,
    errorCount: run.errorCount,
    skippedCount: run.skippedCount,
    adapter: run.adapter,
    lastError: run.lastError ?? undefined,
    startedAt: run.startedAt?.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    percent,
    triggeredBy: run.triggeredBy
      ? {
          id: run.triggeredBy.id,
          name: run.triggeredBy.name,
          email: run.triggeredBy.email,
        }
      : undefined,
  };
}

async function applyVerifyResult(
  applicantId: string,
  result: PartnerVerifyResult,
) {
  const data: Prisma.PartnerApplicantUpdateInput = {
    verificationStatus: result.status as PartnerVerificationStatus,
    lastCheckPayload: result.raw as Prisma.InputJsonValue,
  };

  if (result.status === "verified") {
    data.externalRef = result.externalRef ?? null;
    data.verifiedAt = new Date();
  } else if (result.status === "not_found") {
    data.externalRef = null;
    data.verifiedAt = null;
  }

  await prisma.partnerApplicant.update({
    where: { id: applicantId },
    data,
  });
}

const activeRuns = new Set<string>();

async function processVerificationRun(runId: string) {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);

  const verifier = resolveEzinsureVerifier();
  const delayMs = env.EZINSURE_VERIFY_DELAY_MS;

  try {
    const run = await prisma.partnerVerificationRun.findUnique({
      where: { id: runId },
    });
    if (!run) return;

    await prisma.partnerVerificationRun.update({
      where: { id: runId },
      data: {
        status: "running",
        startedAt: run.startedAt ?? new Date(),
        adapter: verifier.name,
      },
    });

    const applicants = await prisma.partnerApplicant.findMany({
      where: {
        id: { in: run.applicantIds },
        partnerKey: run.partnerKey,
      },
      orderBy: { createdAt: "asc" },
    });

    let verifiedCount = 0;
    let notFoundCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    for (const applicant of applicants) {
      // Idempotent: already verified stays verified unless we re-check errors only.
      if (applicant.verificationStatus === "verified") {
        skippedCount += 1;
        processedCount += 1;
        await prisma.partnerVerificationRun.update({
          where: { id: runId },
          data: { processedCount, skippedCount },
        });
        continue;
      }

      const requestId = `${runId}_${applicant.id}_${randomUUID().slice(0, 8)}`;
      let result: PartnerVerifyResult;
      try {
        result = await verifier.verify({
          requestId,
          partnerKey: run.partnerKey,
          applicant: {
            samuApplicantId: applicant.id,
            fullName: applicant.fullName,
            phone: applicant.phone,
            email: applicant.email,
            nidNumber: applicant.nidNumber,
            province: applicant.province,
            district: applicant.district,
            sector: applicant.sector,
            cell: applicant.cell,
          },
        });
      } catch (error) {
        result = {
          status: "error",
          message:
            error instanceof Error ? error.message : "Unexpected verifier error",
          raw: { unexpected: true },
        };
      }

      await applyVerifyResult(applicant.id, result);

      if (result.status === "verified") verifiedCount += 1;
      else if (result.status === "not_found") notFoundCount += 1;
      else errorCount += 1;

      processedCount += 1;
      await prisma.partnerVerificationRun.update({
        where: { id: runId },
        data: {
          processedCount,
          verifiedCount,
          notFoundCount,
          errorCount,
          skippedCount,
        },
      });

      if (delayMs > 0) await sleep(delayMs);
    }

    await prisma.partnerVerificationRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        processedCount,
        verifiedCount,
        notFoundCount,
        errorCount,
        skippedCount,
        finishedAt: new Date(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification run failed";
    logger.error({ err: error, runId }, "Partner verification run failed");
    await prisma.partnerVerificationRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        lastError: message,
        finishedAt: new Date(),
      },
    });
  } finally {
    activeRuns.delete(runId);
  }
}

export async function startVerificationRun(
  viewer: AuthUser,
  input: {
    partnerKey?: string;
    scope: "selected" | "unverified_all";
    applicantIds?: string[];
    month?: string;
  },
) {
  assertAdmin(viewer);
  const partnerKey = input.partnerKey?.trim() || PARTNER_EZINSURE;
  const limit = env.EZINSURE_VERIFY_BATCH_LIMIT;

  let applicantIds: string[] = [];

  if (input.scope === "selected") {
    const ids = [...new Set((input.applicantIds ?? []).map((id) => id.trim()))].filter(
      Boolean,
    );
    if (ids.length === 0) {
      throw errors.badRequest("Select at least one applicant to verify");
    }
    if (ids.length > limit) {
      throw errors.badRequest(`Select at most ${limit} applicants per run`);
    }
    const found = await prisma.partnerApplicant.findMany({
      where: { id: { in: ids }, partnerKey },
      select: { id: true },
    });
    if (found.length === 0) {
      throw errors.badRequest("No matching applicants for this partner");
    }
    applicantIds = found.map((r) => r.id);
  } else {
    const where: Prisma.PartnerApplicantWhereInput = {
      partnerKey,
      verificationStatus: { in: ["unverified", "error"] },
    };
    if (input.month) where.month = input.month;
    const rows = await prisma.partnerApplicant.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    if (rows.length === 0) {
      throw errors.badRequest(
        "No unverified (or error) applicants to verify for this filter",
      );
    }
    applicantIds = rows.map((r) => r.id);
  }

  const verifier = resolveEzinsureVerifier();
  const run = await prisma.partnerVerificationRun.create({
    data: {
      partnerKey,
      triggeredByUserId: viewer.id,
      scope: input.scope,
      status: "pending",
      applicantIds,
      month: input.month ?? null,
      totalCount: applicantIds.length,
      adapter: verifier.name,
    },
    include: {
      triggeredBy: { select: { id: true, name: true, email: true } },
    },
  });

  // Fire-and-forget on the long-lived API process; FE polls for progress.
  void processVerificationRun(run.id);

  return toPublicRun(run);
}

export async function getVerificationRun(viewer: AuthUser, runId: string) {
  assertAdmin(viewer);
  const run = await prisma.partnerVerificationRun.findUnique({
    where: { id: runId },
    include: {
      triggeredBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!run) throw errors.notFound("Verification run not found");
  return toPublicRun(run);
}

export async function listVerificationRuns(
  viewer: AuthUser,
  opts?: { partnerKey?: string; limit?: number },
) {
  assertAdmin(viewer);
  const partnerKey = opts?.partnerKey?.trim() || PARTNER_EZINSURE;
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const rows = await prisma.partnerVerificationRun.findMany({
    where: { partnerKey },
    include: {
      triggeredBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toPublicRun);
}

export function getVerifyContract(viewer: AuthUser) {
  assertAdmin(viewer);
  return getEzinsureVerifyContract();
}
