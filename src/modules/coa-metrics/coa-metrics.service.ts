import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import { writeAuditLog } from "../../lib/audit.js";
import type { AuthUser } from "../../types/express.js";
import { COA_METRIC_CATALOG } from "./coa-metrics.catalog.js";
import type { UpdateCoaMetricInput } from "./coa-metrics.schemas.js";

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

export async function updateMetric(
  key: string,
  input: UpdateCoaMetricInput,
  actor: AuthUser,
): Promise<PublicCoaMetric> {
  if (actor.role !== "ADMIN") throw errors.forbidden();

  const existing = await prisma.coaMetric.findUnique({ where: { key } });
  if (!existing) throw errors.notFound("Metric not found");

  const row = await prisma.coaMetric.update({
    where: { key },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.adminNote !== undefined ? { adminNote: input.adminNote } : {}),
      ...(input.monthlyTarget !== undefined
        ? { monthlyTarget: input.monthlyTarget }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "coa_metric.update",
    objectType: "coa_metric",
    objectId: row.id,
    summary: `Updated metric ${row.key} (enabled=${row.enabled}, target=${row.monthlyTarget})`,
  });

  return toPublic(row);
}
