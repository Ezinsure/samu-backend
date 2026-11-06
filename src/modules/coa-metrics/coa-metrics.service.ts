import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import type { AuthUser } from "../../types/express.js";
import { COA_METRIC_CATALOG } from "./coa-metrics.catalog.js";

function canReadCatalog(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "COMMUNITY_OPPORTUNITY_ASSOCIATE" ||
    role === "OPERATIONS_MANAGER" ||
    role === "MD_VIEWER"
  );
}

export type PublicCoaMetric = {
  id: string;
  key: string;
  label: string;
  description?: string;
  adminNote?: string;
  monthlyTarget: number;
  evidenceType: string;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
};

function toPublic(row: {
  id: string;
  key: string;
  label: string;
  description: string | null;
  adminNote: string | null;
  monthlyTarget: number;
  evidenceType: string;
  enabled: boolean;
  sortOrder: number;
  updatedAt: Date;
}): PublicCoaMetric {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? undefined,
    adminNote: row.adminNote ?? undefined,
    monthlyTarget: row.monthlyTarget,
    evidenceType: row.evidenceType,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Idempotent upsert of the global imihigo catalog. */
export async function ensureCoaMetricCatalog(): Promise<number> {
  let upserted = 0;
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
        label: seed.label,
        description: seed.description,
        adminNote: seed.adminNote ?? null,
        // Do not overwrite admin edits to target/enabled on re-seed of update path
        // for monthlyTarget/enabled — only fill create. Re-seed refresh of copy only.
        sortOrder: seed.sortOrder,
      },
    });
    upserted += 1;
  }
  return upserted;
}

export async function listMetrics(
  viewer: AuthUser,
  opts: { includeDisabled?: boolean } = {},
): Promise<PublicCoaMetric[]> {
  if (!canReadCatalog(viewer.role)) throw errors.forbidden();

  const includeDisabled =
    opts.includeDisabled ?? viewer.role === "ADMIN";

  const rows = await prisma.coaMetric.findMany({
    where: includeDisabled ? undefined : { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });

  return rows.map(toPublic);
}

export async function getMetricByKey(
  key: string,
  viewer: AuthUser,
): Promise<PublicCoaMetric> {
  if (!canReadCatalog(viewer.role)) throw errors.forbidden();
  const row = await prisma.coaMetric.findUnique({ where: { key } });
  if (!row) throw errors.notFound("Metric not found");
  if (!row.enabled && viewer.role !== "ADMIN") {
    throw errors.forbidden();
  }
  return toPublic(row);
}
