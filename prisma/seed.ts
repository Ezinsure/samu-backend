import { PrismaClient, type TerritoryType, type UserRole } from "@prisma/client";
import argon2 from "argon2";
import { SEED_AGENTS } from "./seed-agents-data.js";
import { SEED_ACTIVITIES } from "./seed-activities-data.js";
import { SEED_LEADS } from "./seed-leads-data.js";
import { SEED_ONBOARDING } from "./seed-onboarding-data.js";
import { SEED_SALES } from "./seed-sales-data.js";

const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  phone?: string;
};

type SeedTerritory = {
  id: string;
  name: string;
  type: TerritoryType;
  parentId?: string;
};

/**
 * Local/demo accounts for every SAMU role.
 * Passwords match DOCs/SAMU-Backend-Implementation-Phases.md — never use in production.
 */
const SEED_USERS: SeedUser[] = [
  {
    email: "admin@solektra.rw",
    name: "SAMU Admin",
    role: "ADMIN",
    password: "Samu@Admin1",
    phone: "+250780000001",
  },
  {
    email: "ops@solektra.rw",
    name: "Ops Manager",
    role: "OPERATIONS_MANAGER",
    password: "Samu@Ops1",
    phone: "+250780000002",
  },
  {
    email: "md@solektra.rw",
    name: "MD Viewer",
    role: "MD_VIEWER",
    password: "Samu@Md1",
    phone: "+250780000003",
  },
  {
    email: "tc.kigali@solektra.rw",
    name: "TC Kigali",
    role: "TERRITORY_COORDINATOR",
    password: "Samu@Tc1",
    phone: "+250780000004",
  },
  {
    email: "tc.south@solektra.rw",
    name: "TC South",
    role: "TERRITORY_COORDINATOR",
    password: "Samu@Tc2",
    phone: "+250780000005",
  },
  {
    email: "agent.demo@solektra.rw",
    name: "Demo Agent",
    role: "AGENT",
    password: "Samu@Agent1",
    phone: "+250780000006",
  },
];

/** Mirrors frontend/data/geography.ts so adapters can swap with stable ids. */
const SEED_TERRITORIES: SeedTerritory[] = [
  { id: "prov-kigali", name: "Kigali City", type: "province" },
  { id: "prov-south", name: "Southern Province", type: "province" },
  { id: "prov-east", name: "Eastern Province", type: "province" },
  { id: "prov-north", name: "Northern Province", type: "province" },
  { id: "prov-west", name: "Western Province", type: "province" },

  { id: "dist-gasabo", name: "Gasabo", type: "district", parentId: "prov-kigali" },
  { id: "dist-kicukiro", name: "Kicukiro", type: "district", parentId: "prov-kigali" },
  { id: "dist-nyarugenge", name: "Nyarugenge", type: "district", parentId: "prov-kigali" },
  { id: "dist-huye", name: "Huye", type: "district", parentId: "prov-south" },
  { id: "dist-muhanga", name: "Muhanga", type: "district", parentId: "prov-south" },
  { id: "dist-rwamagana", name: "Rwamagana", type: "district", parentId: "prov-east" },
  { id: "dist-musanze", name: "Musanze", type: "district", parentId: "prov-north" },
  { id: "dist-rubavu", name: "Rubavu", type: "district", parentId: "prov-west" },

  { id: "sec-remera", name: "Remera", type: "sector", parentId: "dist-gasabo" },
  { id: "sec-kimironko", name: "Kimironko", type: "sector", parentId: "dist-gasabo" },
  { id: "sec-kanombe", name: "Kanombe", type: "sector", parentId: "dist-kicukiro" },
  { id: "sec-gikondo", name: "Gikondo", type: "sector", parentId: "dist-kicukiro" },
  { id: "sec-nyamirambo", name: "Nyamirambo", type: "sector", parentId: "dist-nyarugenge" },
  { id: "sec-ngoma", name: "Ngoma", type: "sector", parentId: "dist-huye" },
  { id: "sec-nyamabuye", name: "Nyamabuye", type: "sector", parentId: "dist-muhanga" },

  { id: "cell-rukiri-i", name: "Rukiri I", type: "cell", parentId: "sec-remera" },
  { id: "cell-rukiri-ii", name: "Rukiri II", type: "cell", parentId: "sec-remera" },
  { id: "cell-kibagabaga", name: "Kibagabaga", type: "cell", parentId: "sec-kimironko" },
  { id: "cell-nyagatovu", name: "Nyagatovu", type: "cell", parentId: "sec-kimironko" },
  { id: "cell-busanza", name: "Busanza", type: "cell", parentId: "sec-kanombe" },
  { id: "cell-kabeza", name: "Kabeza", type: "cell", parentId: "sec-kanombe" },
  { id: "cell-kanserege", name: "Kanserege", type: "cell", parentId: "sec-gikondo" },
  { id: "cell-biryogo", name: "Biryogo", type: "cell", parentId: "sec-nyamirambo" },
  { id: "cell-mwendo", name: "Mwendo", type: "cell", parentId: "sec-nyamirambo" },
  { id: "cell-butare", name: "Butare", type: "cell", parentId: "sec-ngoma" },
  { id: "cell-matyazo", name: "Matyazo", type: "cell", parentId: "sec-ngoma" },
  { id: "cell-gahogo", name: "Gahogo", type: "cell", parentId: "sec-nyamabuye" },
  { id: "cell-kavumu", name: "Kavumu", type: "cell", parentId: "sec-nyamabuye" },
];

/** District → TC email (seed users must exist first). */
const DISTRICT_TC_EMAIL: Record<string, string> = {
  "dist-gasabo": "tc.kigali@solektra.rw",
  "dist-kicukiro": "tc.kigali@solektra.rw",
  "dist-nyarugenge": "tc.kigali@solektra.rw",
  "dist-huye": "tc.south@solektra.rw",
  "dist-muhanga": "tc.south@solektra.rw",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Province → district → sector → cell order for parent FK safety. */
function sortTerritoriesForInsert(rows: SeedTerritory[]): SeedTerritory[] {
  const rank: Record<TerritoryType, number> = {
    province: 0,
    district: 1,
    sector: 2,
    cell: 3,
  };
  return [...rows].sort((a, b) => rank[a.type] - rank[b.type]);
}

async function seedUsers(): Promise<Map<string, string>> {
  console.log("Seeding SAMU users (all roles)…");
  const byEmail = new Map<string, string>();

  for (const seed of SEED_USERS) {
    const passwordHash = await argon2.hash(seed.password, {
      type: argon2.argon2id,
    });

    const user = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        email: seed.email,
        name: seed.name,
        phone: seed.phone,
        role: seed.role,
        status: "active",
        passwordHash,
        avatarInitials: initialsFromName(seed.name),
      },
      update: {
        name: seed.name,
        phone: seed.phone,
        role: seed.role,
        status: "active",
        passwordHash,
        avatarInitials: initialsFromName(seed.name),
      },
    });

    byEmail.set(user.email, user.id);
    console.log(`  ✓ ${user.email} (${user.role})`);
  }

  return byEmail;
}

async function seedTerritories(userByEmail: Map<string, string>) {
  console.log("Seeding territories (geo tree)…");

  for (const row of sortTerritoriesForInsert(SEED_TERRITORIES)) {
    await prisma.territory.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        name: row.name,
        type: row.type,
        parentId: row.parentId,
      },
      update: {
        name: row.name,
        type: row.type,
        parentId: row.parentId,
      },
    });
    console.log(`  ✓ ${row.id} (${row.type})`);
  }

  console.log("Seeding district → TC assignments…");
  const now = new Date();

  for (const [districtId, email] of Object.entries(DISTRICT_TC_EMAIL)) {
    const tcUserId = userByEmail.get(email);
    if (!tcUserId) {
      throw new Error(`Missing seed user for ${email}`);
    }

    // Close prior active rows, then open a fresh assignment (idempotent end state).
    await prisma.territoryAssignment.updateMany({
      where: { territoryId: districtId, active: true },
      data: { active: false, endedAt: now },
    });

    await prisma.territoryAssignment.create({
      data: {
        territoryId: districtId,
        tcUserId,
        startedAt: now,
        active: true,
      },
    });

    await prisma.territory.update({
      where: { id: districtId },
      data: { activeTcUserId: tcUserId },
    });

    console.log(`  ✓ ${districtId} → ${email}`);
  }
}

async function seedAgents(userByEmail: Map<string, string>) {
  console.log("Seeding agents…");
  const now = new Date();

  for (const row of SEED_AGENTS) {
    const tcUserId = userByEmail.get(row.tcEmail);
    if (!tcUserId) {
      throw new Error(`Missing seed TC for ${row.tcEmail}`);
    }

    const status = row.status ?? "Active";
    const agent = await prisma.agent.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        code: row.code,
        name: row.name,
        phone: row.phone,
        nidMasked: `1********${row.phone.replace(/\D/g, "").slice(-3)}`,
        nidVerified: status !== "PendingVerification",
        status,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        geoCell: row.cell,
        lat: row.lat,
        lng: row.lng,
        accuracyMeters: 5,
        tcUserId,
        servicesJson: row.services ?? {},
        lastVisitAt: row.lastVisitAt ? new Date(row.lastVisitAt) : null,
        compliance: row.compliance,
        clientsRegistered: row.clientsRegistered ?? 0,
        recruitedThisMonth: row.recruitedThisMonth ?? false,
        reactivatedThisMonth: row.reactivatedThisMonth ?? false,
        createdAt: new Date("2025-11-01T08:00:00.000Z"),
      },
      update: {
        code: row.code,
        name: row.name,
        phone: row.phone,
        nidMasked: `1********${row.phone.replace(/\D/g, "").slice(-3)}`,
        nidVerified: status !== "PendingVerification",
        status,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        geoCell: row.cell,
        lat: row.lat,
        lng: row.lng,
        tcUserId,
        servicesJson: row.services ?? {},
        lastVisitAt: row.lastVisitAt ? new Date(row.lastVisitAt) : null,
        compliance: row.compliance,
        clientsRegistered: row.clientsRegistered ?? 0,
        recruitedThisMonth: row.recruitedThisMonth ?? false,
        reactivatedThisMonth: row.reactivatedThisMonth ?? false,
      },
    });

    await prisma.agentAssignment.updateMany({
      where: { agentId: agent.id, active: true },
      data: { active: false, endedAt: now },
    });
    await prisma.agentAssignment.create({
      data: {
        agentId: agent.id,
        tcUserId,
        startedAt: now,
        active: true,
      },
    });

    console.log(`  ✓ ${agent.code} (${agent.name})`);
  }

  // Link demo AGENT portal user to agent-001 when present.
  const demoAgentUserId = userByEmail.get("agent.demo@solektra.rw");
  if (demoAgentUserId) {
    await prisma.user.update({
      where: { id: demoAgentUserId },
      data: { agentId: "agent-001" },
    });
    console.log("  ✓ Linked agent.demo@solektra.rw → agent-001");
  }
}

async function seedLeads(userByEmail: Map<string, string>) {
  console.log("Seeding COAP leads…");

  for (const row of SEED_LEADS) {
    const tcUserId = userByEmail.get(row.tcEmail);
    if (!tcUserId) {
      throw new Error(`Missing seed TC for ${row.tcEmail}`);
    }

    const lead = await prisma.lead.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        entityType: row.entityType,
        serviceLine: row.serviceLine,
        status: row.status,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        tcUserId,
        interestSummary: row.interestSummary ?? null,
        notes: row.notes ?? null,
        convertedAt: row.convertedAt ? new Date(row.convertedAt) : null,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      },
      update: {
        name: row.name,
        phone: row.phone,
        entityType: row.entityType,
        serviceLine: row.serviceLine,
        status: row.status,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        tcUserId,
        interestSummary: row.interestSummary ?? null,
        notes: row.notes ?? null,
        convertedAt: row.convertedAt ? new Date(row.convertedAt) : null,
        updatedAt: new Date(row.updatedAt),
      },
    });

    console.log(`  ✓ ${lead.id} (${lead.name})`);
  }
}

async function seedActivities(userByEmail: Map<string, string>) {
  console.log("Seeding COAP field activities…");

  for (const row of SEED_ACTIVITIES) {
    const tcUserId = userByEmail.get(row.tcEmail);
    if (!tcUserId) {
      throw new Error(`Missing seed TC for ${row.tcEmail}`);
    }

    const activity = await prisma.fieldActivity.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        tcUserId,
        serviceLine: row.serviceLine,
        activityType: row.activityType,
        date: new Date(`${row.date}T00:00:00.000Z`),
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        venue: row.venue,
        peopleReached: row.peopleReached,
        summary: row.summary,
        outcome: row.outcome,
        leadId: row.leadId ?? null,
        agentId: row.agentId ?? null,
        createdAt: new Date(row.createdAt),
      },
      update: {
        tcUserId,
        serviceLine: row.serviceLine,
        activityType: row.activityType,
        date: new Date(`${row.date}T00:00:00.000Z`),
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        venue: row.venue,
        peopleReached: row.peopleReached,
        summary: row.summary,
        outcome: row.outcome,
        leadId: row.leadId ?? null,
        agentId: row.agentId ?? null,
      },
    });

    console.log(`  ✓ ${activity.id} (${activity.activityType})`);
  }
}

async function seedOnboarding(userByEmail: Map<string, string>) {
  console.log("Seeding COAP onboarding cases…");

  for (const row of SEED_ONBOARDING) {
    const tcUserId = userByEmail.get(row.tcEmail);
    if (!tcUserId) {
      throw new Error(`Missing seed TC for ${row.tcEmail}`);
    }

    const item = await prisma.onboardingCase.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        tcUserId,
        serviceLine: row.serviceLine,
        kind: row.kind,
        status: row.status,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        leadId: row.leadId ?? null,
        agentId: row.agentId ?? null,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        stageLabel: row.stageLabel,
        notes: row.notes ?? null,
        startedAt: new Date(row.startedAt),
        updatedAt: new Date(row.updatedAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
      },
      update: {
        tcUserId,
        serviceLine: row.serviceLine,
        kind: row.kind,
        status: row.status,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        leadId: row.leadId ?? null,
        agentId: row.agentId ?? null,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        stageLabel: row.stageLabel,
        notes: row.notes ?? null,
        updatedAt: new Date(row.updatedAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
      },
    });

    console.log(`  ✓ ${item.id} (${item.customerName})`);
  }
}

async function seedSales(userByEmail: Map<string, string>) {
  console.log("Seeding COAP sales…");

  for (const row of SEED_SALES) {
    const tcUserId = userByEmail.get(row.tcEmail);
    if (!tcUserId) {
      throw new Error(`Missing seed TC for ${row.tcEmail}`);
    }

    const sale = await prisma.sale.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        tcUserId,
        serviceLine: row.serviceLine,
        productCategory: row.productCategory,
        productName: row.productName,
        quantity: row.quantity,
        amountRwf: row.amountRwf,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        leadId: row.leadId ?? null,
        onboardingId: row.onboardingId ?? null,
        depositRwf: row.depositRwf ?? null,
        installmentMonths: row.installmentMonths ?? null,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        soldAt: new Date(row.soldAt),
        notes: row.notes ?? null,
      },
      update: {
        tcUserId,
        serviceLine: row.serviceLine,
        productCategory: row.productCategory,
        productName: row.productName,
        quantity: row.quantity,
        amountRwf: row.amountRwf,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        leadId: row.leadId ?? null,
        onboardingId: row.onboardingId ?? null,
        depositRwf: row.depositRwf ?? null,
        installmentMonths: row.installmentMonths ?? null,
        geoProvince: row.province,
        geoDistrict: row.district,
        geoSector: row.sector,
        soldAt: new Date(row.soldAt),
        notes: row.notes ?? null,
      },
    });

    console.log(`  ✓ ${sale.id} (${sale.productName})`);
  }
}

/**
 * Idempotent seed: users, geo, agents, COAP leads → sales.
 */
async function main() {
  const userByEmail = await seedUsers();
  await seedTerritories(userByEmail);
  await seedAgents(userByEmail);
  await seedLeads(userByEmail);
  await seedActivities(userByEmail);
  await seedOnboarding(userByEmail);
  await seedSales(userByEmail);
  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
