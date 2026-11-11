import type { Prisma, StockUnitStatus } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import { STOCK_ITEM_TYPE_CATALOG } from "./stock-types.catalog.js";
import type {
  CreateStockTypeInput,
  IntakeUnitsInput,
  ListUnitsQuery,
  PreviewIntakeInput,
  UpdateStockTypeInput,
} from "./stock.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can manage inventory");
  }
}

function normalizeSerial(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export async function ensureStockItemTypes(): Promise<number> {
  let upserted = 0;
  for (const seed of STOCK_ITEM_TYPE_CATALOG) {
    await prisma.stockItemType.upsert({
      where: { key: seed.key },
      create: {
        key: seed.key,
        label: seed.label,
        description: seed.description,
        enabled: seed.enabled,
        sortOrder: seed.sortOrder,
      },
      update: {
        label: seed.label,
        description: seed.description,
        sortOrder: seed.sortOrder,
      },
    });
    upserted += 1;
  }
  return upserted;
}

function toPublicType(row: {
  id: string;
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  updatedAt: Date;
  _count?: { units: number };
}) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description ?? undefined,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    unitCount: row._count?.units ?? 0,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPublicUnit(row: {
  id: string;
  serial: string;
  status: StockUnitStatus;
  condition: string | null;
  notes: string | null;
  attributes: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  type: { id: string; key: string; label: string };
  holder: { id: string; name: string; email: string; role: string } | null;
}) {
  return {
    id: row.id,
    serial: row.serial,
    status: row.status,
    condition: row.condition ?? undefined,
    notes: row.notes ?? undefined,
    attributes:
      row.attributes && typeof row.attributes === "object" && !Array.isArray(row.attributes)
        ? (row.attributes as Record<string, unknown>)
        : undefined,
    type: row.type,
    holder: row.holder
      ? {
          id: row.holder.id,
          name: row.holder.name,
          email: row.holder.email,
          role: row.holder.role,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listTypes(actor: AuthUser, opts?: { includeDisabled?: boolean }) {
  requireAdmin(actor);
  await ensureStockItemTypes();
  const rows = await prisma.stockItemType.findMany({
    where: opts?.includeDisabled ? undefined : { enabled: true },
    include: { _count: { select: { units: true } } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toPublicType);
}

export async function createType(
  input: CreateStockTypeInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const existing = await prisma.stockItemType.findUnique({
    where: { key: input.key },
  });
  if (existing) throw errors.conflict("A device type with this key already exists");

  const row = await prisma.stockItemType.create({
    data: {
      key: input.key,
      label: input.label,
      description: input.description ?? null,
      enabled: input.enabled ?? true,
      sortOrder: input.sortOrder ?? 100,
    },
    include: { _count: { select: { units: true } } },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.type_create",
    objectType: "stock_item_type",
    objectId: row.id,
    summary: `${actor.name} created stock type ${row.key}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicType(row);
}

export async function updateType(
  key: string,
  input: UpdateStockTypeInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const existing = await prisma.stockItemType.findUnique({ where: { key } });
  if (!existing) throw errors.notFound("Device type not found");

  const row = await prisma.stockItemType.update({
    where: { key },
    data: {
      label: input.label,
      description: input.description === undefined ? undefined : input.description,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
    },
    include: { _count: { select: { units: true } } },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.type_update",
    objectType: "stock_item_type",
    objectId: row.id,
    summary: `${actor.name} updated stock type ${row.key}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicType(row);
}

export async function getOverview(actor: AuthUser) {
  requireAdmin(actor);
  await ensureStockItemTypes();

  const grouped = await prisma.stockUnit.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const byTypeRows = await prisma.stockUnit.groupBy({
    by: ["typeId", "status"],
    _count: { _all: true },
  });
  const types = await prisma.stockItemType.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const byType = types.map((t) => {
    const counts: Record<string, number> = {};
    let typeTotal = 0;
    for (const row of byTypeRows) {
      if (row.typeId !== t.id) continue;
      counts[row.status] = row._count._all;
      typeTotal += row._count._all;
    }
    return {
      type: { id: t.id, key: t.key, label: t.label },
      total: typeTotal,
      byStatus: counts,
    };
  });

  // Keep orphaned typeIds (disabled) out of overview cards but include in total via byStatus.
  void typeMap;

  return {
    total,
    byStatus: {
      in_warehouse: byStatus.in_warehouse ?? 0,
      in_transit: byStatus.in_transit ?? 0,
      with_holder: byStatus.with_holder ?? 0,
      sold: byStatus.sold ?? 0,
      returned_by_customer: byStatus.returned_by_customer ?? 0,
      damaged: byStatus.damaged ?? 0,
      written_off: byStatus.written_off ?? 0,
    },
    byType,
  };
}

export async function previewIntake(input: PreviewIntakeInput, actor: AuthUser) {
  requireAdmin(actor);
  const type = await prisma.stockItemType.findUnique({
    where: { key: input.typeKey },
  });
  if (!type || !type.enabled) throw errors.badRequest("Device type is unavailable");

  const seen = new Set<string>();
  const rows: Array<{
    serial: string;
    status: "ready" | "invalid" | "duplicate_in_file" | "exists";
    reason?: string;
  }> = [];

  for (const raw of input.serials) {
    const serial = normalizeSerial(raw);
    if (serial.length < 3) {
      rows.push({
        serial: raw.trim() || "(empty)",
        status: "invalid",
        reason: "Serial is too short",
      });
      continue;
    }
    if (seen.has(serial)) {
      rows.push({
        serial,
        status: "duplicate_in_file",
        reason: "Duplicate serial in this list",
      });
      continue;
    }
    seen.add(serial);
    rows.push({ serial, status: "ready" });
  }

  const readySerials = rows.filter((r) => r.status === "ready").map((r) => r.serial);
  if (readySerials.length > 0) {
    const existing = await prisma.stockUnit.findMany({
      where: { typeId: type.id, serial: { in: readySerials } },
      select: { serial: true },
    });
    const existingSet = new Set(existing.map((e) => e.serial));
    for (const row of rows) {
      if (row.status === "ready" && existingSet.has(row.serial)) {
        row.status = "exists";
        row.reason = "Already in stock for this device type";
      }
    }
  }

  return {
    type: { id: type.id, key: type.key, label: type.label },
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    duplicates: rows.filter((r) => r.status === "duplicate_in_file").length,
    exists: rows.filter((r) => r.status === "exists").length,
    rows,
  };
}

export async function intakeUnits(
  input: IntakeUnitsInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const type = await prisma.stockItemType.findUnique({
    where: { key: input.typeKey },
  });
  if (!type || !type.enabled) throw errors.badRequest("Device type is unavailable");

  const preview = await previewIntake(
    { typeKey: input.typeKey, serials: input.serials },
    actor,
  );
  const ready = preview.rows.filter((r) => r.status === "ready").map((r) => r.serial);
  if (ready.length === 0) {
    throw errors.badRequest("No new serials to intake");
  }

  const createdIds: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (const serial of ready) {
      const unit = await tx.stockUnit.create({
        data: {
          typeId: type.id,
          serial,
          status: "in_warehouse",
          condition: input.condition?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });
      createdIds.push(unit.id);
      await tx.stockMovement.create({
        data: {
          unitId: unit.id,
          type: "intake",
          actorUserId: actor.id,
          note: input.notes?.trim() || null,
          reasonCode: "warehouse_intake",
        },
      });
    }
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.intake",
    objectType: "stock_item_type",
    objectId: type.id,
    summary: `${actor.name} intaked ${createdIds.length} ${type.label} unit(s).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return {
    created: createdIds.length,
    skipped: preview.total - createdIds.length,
    preview,
  };
}

export async function listUnits(query: ListUnitsQuery, actor: AuthUser) {
  requireAdmin(actor);

  const where: Prisma.StockUnitWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.holderUserId) where.holderUserId = query.holderUserId;
  if (query.typeKey) where.type = { key: query.typeKey };
  if (query.search) {
    where.OR = [
      { serial: { contains: query.search, mode: "insensitive" } },
      { notes: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.stockUnit.count({ where }),
    prisma.stockUnit.findMany({
      where,
      include: {
        type: { select: { id: true, key: true, label: true } },
        holder: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: query.pageSize,
    }),
  ]);

  return {
    data: rows.map(toPublicUnit),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getUnit(id: string, actor: AuthUser) {
  requireAdmin(actor);
  const unit = await prisma.stockUnit.findUnique({
    where: { id },
    include: {
      type: { select: { id: true, key: true, label: true } },
      holder: { select: { id: true, name: true, email: true, role: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!unit) throw errors.notFound("Stock unit not found");

  return {
    ...toPublicUnit(unit),
    movements: unit.movements.map((m) => ({
      id: m.id,
      type: m.type,
      fromHolderId: m.fromHolderId ?? undefined,
      toHolderId: m.toHolderId ?? undefined,
      reasonCode: m.reasonCode ?? undefined,
      note: m.note ?? undefined,
      refType: m.refType ?? undefined,
      refId: m.refId ?? undefined,
      actor: m.actor,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}
