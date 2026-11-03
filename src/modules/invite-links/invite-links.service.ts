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

export async function listPendingReviews(actor: AuthUser) {
  const where =
    actor.role === "ADMIN"
      ? { reviewStatus: "pending_review" as const }
      : {
          reviewStatus: "pending_review" as const,
          recruitedByUserId: actor.id,
        };

  const rows = await prisma.agent.findMany({
    where,
    include: {
      recruitedBy: { select: { name: true } },
      tcUser: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return rows.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    phone: a.phone,
    email: a.email,
    district: a.geoDistrict,
    createdAt: a.createdAt.toISOString(),
    recruitedByName: a.recruitedBy?.name,
    tcName: a.tcUser?.name,
  }));
}
