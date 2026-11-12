import type { PartnerVerificationStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import type { AuthUser } from "../../types/express.js";
import {
  PARTNER_EZINSURE,
  type ApplicantsSummaryQuery,
  type ListApplicantsQuery,
} from "./partners.schemas.js";

function currentUtcMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function assertAdmin(viewer: AuthUser) {
  if (viewer.role !== "ADMIN") throw errors.forbidden();
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function toPublicApplicant(
  row: {
    id: string;
    partnerKey: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    nidNumber: string | null;
    province: string | null;
    district: string | null;
    sector: string | null;
    cell: string | null;
    month: string;
    loggedByUserId: string;
    entryId: string | null;
    clientRowId: string | null;
    verificationStatus: PartnerVerificationStatus;
    externalRef: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    loggedBy?: { id: string; name: string; email: string } | null;
  },
) {
  return {
    id: row.id,
    partnerKey: row.partnerKey,
    fullName: row.fullName,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    nidNumber: row.nidNumber ?? undefined,
    province: row.province ?? undefined,
    district: row.district ?? undefined,
    sector: row.sector ?? undefined,
    cell: row.cell ?? undefined,
    month: row.month,
    loggedByUserId: row.loggedByUserId,
    entryId: row.entryId ?? undefined,
    clientRowId: row.clientRowId ?? undefined,
    verificationStatus: row.verificationStatus,
    externalRef: row.externalRef ?? undefined,
    verifiedAt: row.verifiedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    loggedBy: row.loggedBy
      ? {
          id: row.loggedBy.id,
          name: row.loggedBy.name,
          email: row.loggedBy.email,
        }
      : undefined,
  };
}

export async function listApplicants(
  viewer: AuthUser,
  query: ListApplicantsQuery,
) {
  assertAdmin(viewer);

  const where: Prisma.PartnerApplicantWhereInput = {
    partnerKey: query.partnerKey,
  };
  if (query.month) where.month = query.month;
  if (query.coaUserId) where.loggedByUserId = query.coaUserId;
  if (query.verificationStatus) {
    where.verificationStatus = query.verificationStatus;
  }
  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.partnerApplicant.count({ where }),
    prisma.partnerApplicant.findMany({
      where,
      include: {
        loggedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: query.limit,
      skip: query.offset,
    }),
  ]);

  return {
    total,
    limit: query.limit,
    offset: query.offset,
    rows: rows.map(toPublicApplicant),
  };
}

export async function exportApplicantsCsv(
  viewer: AuthUser,
  query: ListApplicantsQuery,
) {
  assertAdmin(viewer);

  const where: Prisma.PartnerApplicantWhereInput = {
    partnerKey: query.partnerKey,
  };
  if (query.month) where.month = query.month;
  if (query.coaUserId) where.loggedByUserId = query.coaUserId;
  if (query.verificationStatus) {
    where.verificationStatus = query.verificationStatus;
  }
  if (query.q?.trim()) {
    const q = query.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { district: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.partnerApplicant.findMany({
    where,
    include: {
      loggedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10_000,
  });

  const headers = [
    "fullName",
    "phone",
    "email",
    "nidNumber",
    "province",
    "district",
    "sector",
    "cell",
    "month",
    "verificationStatus",
    "externalRef",
    "verifiedAt",
    "coaName",
    "coaEmail",
    "createdAt",
  ];

  const lines = rows.map((row) =>
    [
      row.fullName,
      row.phone,
      row.email,
      row.nidNumber,
      row.province,
      row.district,
      row.sector,
      row.cell,
      row.month,
      row.verificationStatus,
      row.externalRef,
      row.verifiedAt?.toISOString() ?? "",
      row.loggedBy.name,
      row.loggedBy.email,
      row.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = `${headers.join(",")}\n${lines.join("\n")}\n`;
  const stamp = query.month ?? new Date().toISOString().slice(0, 10);
  return {
    filename: `${query.partnerKey}-applicants-${stamp}.csv`,
    csv,
  };
}

/** Month rollup: logged vs verified per COA (and national totals). */
export async function getApplicantsSummary(
  viewer: AuthUser,
  query: ApplicantsSummaryQuery,
) {
  assertAdmin(viewer);
  const period =
    query.month && /^\d{4}-\d{2}$/.test(query.month)
      ? query.month
      : currentUtcMonth();
  const partnerKey = query.partnerKey || PARTNER_EZINSURE;

  const grouped = await prisma.partnerApplicant.groupBy({
    by: ["loggedByUserId", "verificationStatus"],
    where: { partnerKey, month: period },
    _count: { _all: true },
  });

  const byCoa = new Map<
    string,
    { logged: number; verified: number; notFound: number; error: number }
  >();

  for (const row of grouped) {
    const prev = byCoa.get(row.loggedByUserId) ?? {
      logged: 0,
      verified: 0,
      notFound: 0,
      error: 0,
    };
    prev.logged += row._count._all;
    if (row.verificationStatus === "verified") prev.verified += row._count._all;
    if (row.verificationStatus === "not_found") {
      prev.notFound += row._count._all;
    }
    if (row.verificationStatus === "error") prev.error += row._count._all;
    byCoa.set(row.loggedByUserId, prev);
  }

  const coaIds = [...byCoa.keys()];
  const users = coaIds.length
    ? await prisma.user.findMany({
        where: { id: { in: coaIds } },
        select: {
          id: true,
          name: true,
          email: true,
          workingDistrict: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const rows = [...byCoa.entries()]
    .map(([coaUserId, counts]) => {
      const coa = userById.get(coaUserId);
      return {
        coa: {
          id: coaUserId,
          name: coa?.name ?? "Unknown",
          email: coa?.email ?? "",
          workingDistrict: coa?.workingDistrict ?? undefined,
        },
        logged: counts.logged,
        verified: counts.verified,
        notFound: counts.notFound,
        error: counts.error,
        unverified: Math.max(
          0,
          counts.logged - counts.verified - counts.notFound - counts.error,
        ),
      };
    })
    .sort((a, b) => a.coa.name.localeCompare(b.coa.name));

  const totals = rows.reduce(
    (acc, row) => ({
      logged: acc.logged + row.logged,
      verified: acc.verified + row.verified,
      notFound: acc.notFound + row.notFound,
      error: acc.error + row.error,
      unverified: acc.unverified + row.unverified,
    }),
    { logged: 0, verified: 0, notFound: 0, error: 0, unverified: 0 },
  );

  return { month: period, partnerKey, rows, totals };
}

export async function countLoggedApplicants(opts: {
  partnerKey: string;
  loggedByUserId: string;
  month: string;
}): Promise<number> {
  return prisma.partnerApplicant.count({
    where: {
      partnerKey: opts.partnerKey,
      loggedByUserId: opts.loggedByUserId,
      month: opts.month,
    },
  });
}

export async function countVerifiedApplicants(opts: {
  partnerKey: string;
  loggedByUserId: string;
  month: string;
}): Promise<number> {
  return prisma.partnerApplicant.count({
    where: {
      partnerKey: opts.partnerKey,
      loggedByUserId: opts.loggedByUserId,
      month: opts.month,
      verificationStatus: "verified",
    },
  });
}
