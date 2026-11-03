import { randomBytes } from "node:crypto";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { DEFAULT_AGENT_SERVICES } from "../agents/agents.mapper.js";
import type { PublicRegisterInput } from "./public-network.schemas.js";

export async function registerFromPublicForm(input: PublicRegisterInput) {
  let recruitedByUserId: string | null = null;
  let tcUserId: string | null = null;

  if (input.inviteToken) {
    const link = await prisma.inviteLink.findUnique({
      where: { token: input.inviteToken },
      include: { owner: { select: { id: true, role: true, status: true } } },
    });
    if (!link || !link.active || link.owner.status !== "active") {
      throw errors.badRequest("Invalid or inactive invite link");
    }
    recruitedByUserId = link.owner.id;
    if (link.owner.role === "TERRITORY_COORDINATOR") {
      tcUserId = link.owner.id;
    }
  }

  const code = `AGT-PUB-${randomBytes(3).toString("hex").toUpperCase()}`;
  const id = `agent-${Date.now()}-${randomBytes(2).toString("hex")}`;
  const nidDigits = input.nimeroIrangamuntu.replace(/\D/g, "");

  const agent = await prisma.agent.create({
    data: {
      id,
      code,
      name: input.amazina.trim(),
      phone: input.telefone.trim(),
      email: input.email.trim().toLowerCase(),
      nidMasked: `1********${nidDigits.slice(-3)}`,
      nidVerified: false,
      status: "Candidate",
      reviewStatus: "pending_review",
      age: input.imyaka,
      gender: input.igitsina,
      education: input.amashuri,
      tin: input.tin,
      businessType: input.ubwokoBizinesi,
      venue: input.venue,
      emergencyContactName: input.emergencyName,
      emergencyContactPhone: input.emergencyPhone,
      criminalRecordBillId: input.criminalRecordBillId,
      certificateStorageKey: input.certificateStorageKey ?? null,
      hasPrinterScanner: input.hasPrinterScanner,
      hasComputer: input.hasComputer,
      officeType: input.officeType,
      building: input.building,
      geoProvince: input.province,
      geoDistrict: input.akarere,
      geoSector: input.umurenge,
      geoCell: input.akagari,
      geoVillage: input.umudugudu,
      lat: input.lat ?? -1.9441,
      lng: input.lng ?? 30.0619,
      tcUserId,
      recruitedByUserId,
      servicesJson: {
        ...DEFAULT_AGENT_SERVICES,
        printer: input.hasPrinterScanner,
        smartphone: input.hasComputer,
      },
      compliance: "yellow",
      recruitedThisMonth: true,
    },
  });

  if (tcUserId) {
    await prisma.agentAssignment.create({
      data: {
        agentId: agent.id,
        tcUserId,
        active: true,
      },
    });
  }

  logger.info(
    { agentId: agent.id, recruitedByUserId, invite: Boolean(input.inviteToken) },
    "Public network registration",
  );

  return {
    id: agent.id,
    code: agent.code,
    name: agent.name,
    status: agent.status,
    networkRole: "Agent candidate" as const,
    reviewStatus: agent.reviewStatus,
  };
}
