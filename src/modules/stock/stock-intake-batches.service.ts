import type { Prisma, StockUnitStatus } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import { formatAttributeLabel } from "./stock-attributes.js";
import type { ListIntakeBatchesQuery } from "./stock.schemas.js";

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can view intake batches");
  }
}

const STATUS_ORDER: StockUnitStatus[] = [
  "in_warehouse",
  "in_transit",
  "with_holder",
  "sold",
  "returned_by_customer",
  "damaged",
  "returned_to_supplier",
  "written_off",
];

const STATUS_LABEL: Record<StockUnitStatus, string> = {
  in_warehouse: "In warehouse",
  in_transit: "In transit",
  with_holder: "With field holders",
  sold: "With clients",
  returned_by_customer: "Returned by customer",
  damaged: "Faulty / damaged",
  returned_to_supplier: "Returned to supplier",
  written_off: "Deactivated",
};

export type BatchCompositionRow = {
  status: StockUnitStatus;
  label: string;
  count: number;
  percent: number;
};

export type BatchTypeComposition = {
  type: { id: string; key: string; label: string };
  total: number;
  composition: BatchCompositionRow[];
};

export type BatchAttributeComposition = {
  type: { id: string; key: string; label: string };
  brand?: string;
  model?: string;
  label: string;
  total: number;
  composition: BatchCompositionRow[];
};

type BatchStats = {
  total: number;
  composition: BatchCompositionRow[];
  byType: BatchTypeComposition[];
  byAttribute: BatchAttributeComposition[];
};

function buildComposition(
  counts: Map<StockUnitStatus, number>,
  total: number,
): BatchCompositionRow[] {
  const rows: BatchCompositionRow[] = [];
  for (const status of STATUS_ORDER) {
    const count = counts.get(status) ?? 0;
    if (count === 0) continue;
    rows.push({
      status,
      label: STATUS_LABEL[status],
      count,
      percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    });
  }
  return rows;
}

function emptyStatusCounts(): Map<StockUnitStatus, number> {
  return new Map();
}

async function compositionForBatchIds(batchIds: string[]) {
  if (batchIds.length === 0) {
    return { byBatch: new Map<string, BatchStats>() };
  }

  const grouped = await prisma.stockUnit.groupBy({
    by: ["intakeBatchId", "typeId", "status"],
    where: { intakeBatchId: { in: batchIds } },
    _count: { _all: true },
  });

  const attributed = await prisma.stockUnit.findMany({
    where: { intakeBatchId: { in: batchIds } },
    select: {
      intakeBatchId: true,
      typeId: true,
      status: true,
      attributes: true,
    },
  });

  const typeIds = [
    ...new Set([
      ...grouped.map((g) => g.typeId),
      ...attributed.map((u) => u.typeId),
    ]),
  ];
  const types = typeIds.length
    ? await prisma.stockItemType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, key: true, label: true },
      })
    : [];
  const typeById = new Map(types.map((t) => [t.id, t]));

  const byBatch = new Map<
    string,
    {
      total: number;
      statusCounts: Map<StockUnitStatus, number>;
      typeStatus: Map<string, Map<StockUnitStatus, number>>;
      typeTotals: Map<string, number>;
      attrStatus: Map<string, Map<StockUnitStatus, number>>;
      attrMeta: Map<
        string,
        { typeId: string; brand?: string; model?: string; label: string }
      >;
    }
  >();

  for (const row of grouped) {
    if (!row.intakeBatchId) continue;
    let bucket = byBatch.get(row.intakeBatchId);
    if (!bucket) {
      bucket = {
        total: 0,
        statusCounts: emptyStatusCounts(),
        typeStatus: new Map(),
        typeTotals: new Map(),
        attrStatus: new Map(),
        attrMeta: new Map(),
      };
      byBatch.set(row.intakeBatchId, bucket);
    }
    const count = row._count._all;
    bucket.total += count;
    bucket.statusCounts.set(
      row.status,
      (bucket.statusCounts.get(row.status) ?? 0) + count,
    );
    bucket.typeTotals.set(
      row.typeId,
      (bucket.typeTotals.get(row.typeId) ?? 0) + count,
    );
    let typeMap = bucket.typeStatus.get(row.typeId);
    if (!typeMap) {
      typeMap = emptyStatusCounts();
      bucket.typeStatus.set(row.typeId, typeMap);
    }
    typeMap.set(row.status, (typeMap.get(row.status) ?? 0) + count);
  }

  for (const unit of attributed) {
    if (!unit.intakeBatchId) continue;
    let bucket = byBatch.get(unit.intakeBatchId);
    if (!bucket) {
      bucket = {
        total: 0,
        statusCounts: emptyStatusCounts(),
        typeStatus: new Map(),
        typeTotals: new Map(),
        attrStatus: new Map(),
        attrMeta: new Map(),
      };
      byBatch.set(unit.intakeBatchId, bucket);
    }
    const attrs =
      unit.attributes &&
      typeof unit.attributes === "object" &&
      !Array.isArray(unit.attributes)
        ? (unit.attributes as Record<string, unknown>)
        : null;
    const brand =
      typeof attrs?.brand === "string" ? attrs.brand.trim() : undefined;
    const model =
      typeof attrs?.model === "string" ? attrs.model.trim() : undefined;
    const label = formatAttributeLabel(attrs);
    if (!label) continue;
    const attrKey = `${unit.typeId}::${brand ?? ""}::${model ?? ""}`;
    if (!bucket.attrMeta.has(attrKey)) {
      bucket.attrMeta.set(attrKey, {
        typeId: unit.typeId,
        brand,
        model,
        label,
      });
    }
    let attrMap = bucket.attrStatus.get(attrKey);
    if (!attrMap) {
      attrMap = emptyStatusCounts();
      bucket.attrStatus.set(attrKey, attrMap);
    }
    attrMap.set(unit.status, (attrMap.get(unit.status) ?? 0) + 1);
  }

  const result = new Map<string, BatchStats>();

  for (const [batchId, bucket] of byBatch) {
    const byType: BatchTypeComposition[] = [];
    for (const [typeId, typeTotal] of bucket.typeTotals) {
      const type = typeById.get(typeId);
      if (!type) continue;
      byType.push({
        type,
        total: typeTotal,
        composition: buildComposition(
          bucket.typeStatus.get(typeId) ?? emptyStatusCounts(),
          typeTotal,
        ),
      });
    }
    byType.sort((a, b) => a.type.label.localeCompare(b.type.label));

    const byAttribute: BatchAttributeComposition[] = [];
    for (const [attrKey, meta] of bucket.attrMeta) {
      const type = typeById.get(meta.typeId);
      if (!type) continue;
      const counts = bucket.attrStatus.get(attrKey) ?? emptyStatusCounts();
      let total = 0;
      for (const n of counts.values()) total += n;
      byAttribute.push({
        type,
        brand: meta.brand,
        model: meta.model,
        label: meta.label,
        total,
        composition: buildComposition(counts, total),
      });
    }
    byAttribute.sort((a, b) => a.label.localeCompare(b.label));

    result.set(batchId, {
      total: bucket.total,
      composition: buildComposition(bucket.statusCounts, bucket.total),
      byType,
      byAttribute,
    });
  }

  return { byBatch: result };
}

function toPublicBatchSummary(
  row: {
    id: string;
    label: string;
    supplierRef: string | null;
    note: string | null;
    receivedAt: Date;
    createdAt: Date;
    type: { id: string; key: string; label: string } | null;
    createdBy: { id: string; name: string; email: string };
  },
  stats: BatchStats,
) {
  return {
    id: row.id,
    label: row.label,
    supplierRef: row.supplierRef ?? undefined,
    note: row.note ?? undefined,
    receivedAt: row.receivedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    type: row.type,
    createdBy: row.createdBy,
    unitCount: stats.total,
    composition: stats.composition,
    byType: stats.byType,
    byAttribute: stats.byAttribute,
  };
}

export async function listIntakeBatches(
  query: ListIntakeBatchesQuery,
  actor: AuthUser,
) {
  requireAdmin(actor);

  const where: Prisma.StockIntakeBatchWhereInput = {};
  if (query.typeKey) where.type = { key: query.typeKey };
  if (query.search) {
    where.OR = [
      { label: { contains: query.search, mode: "insensitive" } },
      { supplierRef: { contains: query.search, mode: "insensitive" } },
      { note: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.stockIntakeBatch.count({ where }),
    prisma.stockIntakeBatch.findMany({
      where,
      include: {
        type: { select: { id: true, key: true, label: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: query.pageSize,
    }),
  ]);

  const { byBatch } = await compositionForBatchIds(rows.map((r) => r.id));

  return {
    data: rows.map((row) =>
      toPublicBatchSummary(
        row,
        byBatch.get(row.id) ?? {
          total: 0,
          composition: [],
          byType: [],
          byAttribute: [],
        },
      ),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getIntakeBatch(id: string, actor: AuthUser) {
  requireAdmin(actor);

  const row = await prisma.stockIntakeBatch.findUnique({
    where: { id },
    include: {
      type: { select: { id: true, key: true, label: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      units: {
        include: {
          type: { select: { id: true, key: true, label: true } },
          holder: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: [{ status: "asc" }, { serial: "asc" }],
        take: 500,
      },
    },
  });
  if (!row) throw errors.notFound("Intake batch not found");

  const { byBatch } = await compositionForBatchIds([row.id]);
  const stats = byBatch.get(row.id) ?? {
    total: 0,
    composition: [],
    byType: [],
    byAttribute: [],
  };

  const unitsTruncated = stats.total > row.units.length;

  return {
    ...toPublicBatchSummary(row, stats),
    unitsTruncated,
    units: row.units.map((unit) => ({
      id: unit.id,
      serial: unit.serial,
      status: unit.status,
      condition: unit.condition ?? undefined,
      notes: unit.notes ?? undefined,
      attributes:
        unit.attributes &&
        typeof unit.attributes === "object" &&
        !Array.isArray(unit.attributes)
          ? (unit.attributes as Record<string, unknown>)
          : undefined,
      type: unit.type,
      holder: unit.holder,
      createdAt: unit.createdAt.toISOString(),
      updatedAt: unit.updatedAt.toISOString(),
    })),
  };
}

export { STATUS_LABEL };
