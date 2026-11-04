import { randomBytes } from "node:crypto";
import { errors } from "../../lib/errors.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

function canOwnInvite(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "TERRITORY_COORDINATOR" ||
    role === "COMMUNITY_OPPORTUNITY_ASSOCIATE"
  );
}

export async function getOrCreateInviteLink(actor: AuthUser) {
  if (!canOwnInvite(actor.role)) throw errors.forbidden();

  let link = await prisma.inviteLink.findUnique({
    where: { ownerUserId: actor.id },
  });

  if (!link) {
    link = await prisma.inviteLink.create({
      data: {
        token: randomBytes(16).toString("hex"),
        ownerUserId: actor.id,
        active: true,
      },
    });
  }

  const joinPath = `/join/${link.token}`;
  return {
    id: link.id,
    token: link.token,
    active: link.active,
    url: `${env.FRONTEND_ORIGIN}${joinPath}`,
    path: joinPath,
    createdAt: link.createdAt.toISOString(),
  };
}

export async function listPendingReviews(
  actor: AuthUser,
  query: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 10));

  const where =
    actor.role === "ADMIN"
      ? { reviewStatus: "pending_review" as const }
      : {
          reviewStatus: "pending_review" as const,
          recruitedByUserId: actor.id,
        };

  const [total, rows] = await Promise.all([
    prisma.agent.count({ where }),
    prisma.agent.findMany({
      where,
      include: {
        recruitedBy: { select: { name: true } },
        tcUser: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      phone: a.phone,
      email: a.email,
      age: a.age,
      gender: a.gender,
      education: a.education,
      tin: a.tin,
      businessType: a.businessType,
      venue: a.venue,
      emergencyContactName: a.emergencyContactName,
      emergencyContactPhone: a.emergencyContactPhone,
      criminalRecordBillId: a.criminalRecordBillId,
      hasPrinterScanner: a.hasPrinterScanner,
      hasComputer: a.hasComputer,
      officeType: a.officeType,
      building: a.building,
      province: a.geoProvince,
      district: a.geoDistrict,
      sector: a.geoSector,
      cell: a.geoCell,
      village: a.geoVillage,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      recruitedByName: a.recruitedBy?.name,
      tcName: a.tcUser?.name,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
