import { PrismaClient, type UserRole } from "@prisma/client";
import argon2 from "argon2";
import { COA_METRIC_CATALOG } from "../src/modules/coa-metrics/coa-metrics.catalog.js";

const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  phone?: string;
};

/**
 * Staging / local UAT accounts.
 * Passwords are for shared demos only — change before production.
 */
const SEED_USERS: SeedUser[] = [
  {
    email: "samu_admin@yopmail.com",
    name: "SAMU Admin",
    role: "ADMIN",
    password: "Admin@123",
    phone: "+250780000001",
  },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

async function seedCoaMetrics(): Promise<void> {
  console.log(`Seeding COA imihigo metrics (${COA_METRIC_CATALOG.length})…`);
  for (const seed of COA_METRIC_CATALOG) {
    await prisma.coaMetric.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        label: seed.label,
        description: seed.description,
        adminNote: seed.adminNote ?? null,
        monthlyTarget: seed.monthlyTarget,
        evidenceType: seed.evidenceType,
        enabled: seed.enabled,
        sortOrder: seed.sortOrder,
      },
      update: {
        // Preserve Admin edits to target/enabled; refresh copy + evidence type only.
        label: seed.label,
        description: seed.description,
        adminNote: seed.adminNote ?? null,
        evidenceType: seed.evidenceType,
        sortOrder: seed.sortOrder,
      },
    });
    console.log(
      `  ✓ ${seed.key} (target ${seed.monthlyTarget}, ${seed.enabled ? "enabled" : "disabled"})`,
    );
  }

  const { ensureCoaMetricVariants } = await import(
    "../src/modules/coa-metrics/coa-metric-variants.service.js"
  );
  const variants = await ensureCoaMetricVariants();
  console.log(`  ✓ ${variants} metric variants upserted`);
}

async function seedUsers(
  users: SeedUser[] = SEED_USERS,
): Promise<Map<string, string>> {
  console.log(`Seeding SAMU users (${users.length})…`);
  const byEmail = new Map<string, string>();

  for (const seed of users) {
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

async function seedAdmin(userByEmail: Map<string, string>) {
  console.log("Seeding system settings + sample audit…");

  const adminId = userByEmail.get("samu_admin@yopmail.com");
  const { DEFAULT_KPI_TARGETS } = await import("../src/lib/reporting.js");

  await prisma.systemSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      gpsDistanceMeters: 10,
      agentGreenDays: 60,
      agentYellowDays: 30,
      tcComplianceGreen: 90,
      tcComplianceYellow: 70,
      monthlyReportDueDay: 5,
      kpiTargetsJson: DEFAULT_KPI_TARGETS,
      smsTemplatesJson: {
        visit_confirmation:
          "SAMU: A territory coordinator visited you today. Reply YES to confirm or NO if incorrect.",
        visit_reminder:
          "SAMU reminder: please confirm your recent agent visit via SMS.",
      },
      updatedByUserId: adminId ?? null,
    },
    update: {},
  });
  console.log("  ✓ system_settings/default");

  const sampleAudits = [
    {
      id: "audit-seed-settings",
      actorUserId: adminId ?? null,
      action: "settings.seed",
      objectType: "system_settings",
      objectId: "default",
      summary: "System settings seeded for local development.",
    },
    {
      id: "audit-seed-login",
      actorUserId: adminId ?? null,
      action: "user.login",
      objectType: "user",
      objectId: adminId ?? "admin",
      summary: "Seed placeholder: Admin signed in.",
    },
  ];

  for (const row of sampleAudits) {
    await prisma.auditLog.upsert({
      where: { id: row.id },
      create: row,
      update: {
        actorUserId: row.actorUserId,
        action: row.action,
        objectType: row.objectType,
        objectId: row.objectId,
        summary: row.summary,
      },
    });
    console.log(`  ✓ ${row.id}`);
  }
}

/**
 * Idempotent UAT seed: admin account, system settings, and COA imihigo metrics.
 *
 * Modes (`SEED_MODE` env or CLI flag):
 * - `uat` / `users` / `full` (default) — same lean path for staging
 *
 * Create TC/COA accounts from the app (Users → Import COAs / New user).
 */
async function main() {
  const mode = (
    process.env.SEED_MODE ??
    (process.argv.includes("--users")
      ? "users"
      : process.argv.includes("--uat")
        ? "uat"
        : "full")
  ).toLowerCase();
  console.log(`Seed mode: ${mode} (admin + settings + COA metrics)`);

  if (mode !== "users" && mode !== "full" && mode !== "uat") {
    throw new Error(`Unknown SEED_MODE="${mode}". Use "uat", "users", or "full".`);
  }

  const userByEmail = await seedUsers();
  await seedAdmin(userByEmail);
  await seedCoaMetrics();
  const { ensureStockItemTypes } = await import(
    "../src/modules/stock/stock.service.js"
  );
  const stockTypes = await ensureStockItemTypes();
  console.log(`  ✓ ${stockTypes} stock item types upserted`);
  console.log("Seed complete (admin + settings + COA metrics + stock types).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
