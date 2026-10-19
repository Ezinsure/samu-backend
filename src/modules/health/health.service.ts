import { prisma } from "../../lib/prisma.js";

export type HealthStatus = {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  database: "up" | "down";
  timestamp: string;
};

/**
 * Probes process liveness and database connectivity.
 * Used by container orchestrators and local smoke tests.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  let database: "up" | "down" = "down";

  try {
    // Lightweight round-trip — does not depend on business tables.
    await prisma.$queryRaw`SELECT 1`;
    database = "up";
  } catch {
    database = "down";
  }

  return {
    status: database === "up" ? "ok" : "degraded",
    uptimeSeconds: Math.floor(process.uptime()),
    database,
    timestamp: new Date().toISOString(),
  };
}
