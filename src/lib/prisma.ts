import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma client instance for the process.
 * Cached on globalThis so tsx hot-reload does not open extra pools.
 *
 * Neon / PgBouncer note: use only the sequential form
 * `prisma.$transaction([op1, op2, …])`. Do NOT use interactive
 * `prisma.$transaction(async (tx) => { … })` — the pooler closes those
 * mid-flight (Prisma P2028 / "Transaction already closed").
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
