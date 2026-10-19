import { PrismaClient, type UserRole } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

type SeedUser = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  phone?: string;
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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/**
 * Upsert seed users so re-running seed is idempotent (password/role reset to doc values).
 */
async function main() {
  console.log("Seeding SAMU users (all roles)…");

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

    console.log(`  ✓ ${user.email} (${user.role})`);
  }

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
