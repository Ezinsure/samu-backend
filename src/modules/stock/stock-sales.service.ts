import type { Prisma, StockUnitStatus } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { writeAuditLog } from "../../lib/audit.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

type Db = Prisma.TransactionClient | typeof prisma;

type RequestMeta = { ip?: string; userAgent?: string };

const AVAILABLE_STATUSES: StockUnitStatus[] = [
  "with_holder",
  "returned_by_customer",
];

function isAdmin(actor: AuthUser) {
  return actor.role === "ADMIN";
}

export type AvailableUnit = {
  id: string;
  serial: string;
  status: StockUnitStatus;
  condition?: string;
  type: { id: string; key: string; label: string };
  holder: { id: string; name: string; email: string; role: string } | null;
};

/** Units the actor can sell / log (in hand). Admin may list any holder's stock. */
export async function listAvailableUnits(
  actor: AuthUser,
  opts?: {
    typeKey?: string;
    search?: string;
    holderUserId?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const where: Prisma.StockUnitWhereInput = {
    status: { in: AVAILABLE_STATUSES },
  };

  if (isAdmin(actor) && opts?.holderUserId) {
    where.holderUserId = opts.holderUserId;
  } else if (!isAdmin(actor)) {
    where.holderUserId = actor.id;
  } else {
    // Admin without holder filter: still only with_holder units
    where.holderUserId = { not: null };
  }

  if (opts?.typeKey) where.type = { key: opts.typeKey };
  if (opts?.search) {
    where.serial = { contains: opts.search, mode: "insensitive" };
  }

  const skip = (page - 1) * pageSize;
  const [total, rows] = await Promise.all([
    prisma.stockUnit.count({ where }),
    prisma.stockUnit.findMany({
      where,
      include: {
        type: { select: { id: true, key: true, label: true } },
        holder: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: [{ serial: "asc" }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    data: rows.map(
      (row): AvailableUnit => ({
        id: row.id,
        serial: row.serial,
        status: row.status,
        condition: row.condition ?? undefined,
        type: row.type,
        holder: row.holder,
      }),
    ),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

async function loadUnitsForConsume(db: Db, unitIds: string[]) {
  const unique = [...new Set(unitIds)];
  if (unique.length === 0) return [];
  const rows = await db.stockUnit.findMany({
    where: { id: { in: unique } },
    include: { type: true },
  });
  if (rows.length !== unique.length) {
    throw errors.badRequest("One or more selected stock units were not found");
  }
  return rows;
}

/**
 * Mark in-hand units as sold and append sale movements.
 * Conditional update prevents double-sale races.
 */
export async function consumeUnits(
  db: Db,
  input: {
    unitIds: string[];
    actor: AuthUser;
    refType: string;
    refId: string;
    note?: string;
    /** When set, units must belong to this holder (COA/TC logging as self). */
    requiredHolderId?: string;
    allowedTypeKeys?: string[];
  },
) {
  const units = await loadUnitsForConsume(db, input.unitIds);
  if (input.allowedTypeKeys?.length) {
    const allowed = new Set(input.allowedTypeKeys);
    for (const unit of units) {
      if (!allowed.has(unit.type.key)) {
        throw errors.badRequest(
          `Unit ${unit.serial} is type ${unit.type.label}, which is not valid for this sale`,
        );
      }
    }
  }

  for (const unit of units) {
    if (!AVAILABLE_STATUSES.includes(unit.status)) {
      throw errors.badRequest(
        `Unit ${unit.serial} is not available in hand (status: ${unit.status})`,
      );
    }
    if (!unit.holderUserId) {
      throw errors.badRequest(`Unit ${unit.serial} has no holder`);
    }
    if (
      input.requiredHolderId &&
      unit.holderUserId !== input.requiredHolderId &&
      !isAdmin(input.actor)
    ) {
      throw errors.forbidden(`Unit ${unit.serial} is not in your stock`);
    }
    if (
      !isAdmin(input.actor) &&
      unit.holderUserId !== input.actor.id &&
      unit.holderUserId !== input.requiredHolderId
    ) {
      throw errors.forbidden(`Unit ${unit.serial} is not in your stock`);
    }

    const updated = await db.stockUnit.updateMany({
      where: {
        id: unit.id,
        status: { in: AVAILABLE_STATUSES },
        holderUserId: unit.holderUserId,
      },
      data: { status: "sold" },
    });
    if (updated.count !== 1) {
      throw errors.conflict(
        `Unit ${unit.serial} was just sold or moved; refresh and retry`,
      );
    }

    await db.stockMovement.create({
      data: {
        unitId: unit.id,
        type: "sale",
        fromHolderId: unit.holderUserId,
        toHolderId: null,
        actorUserId: input.actor.id,
        reasonCode: "field_sale",
        note: input.note ?? null,
        refType: input.refType,
        refId: input.refId,
      },
    });
  }

  return units.map((u) => ({
    id: u.id,
    serial: u.serial,
    typeKey: u.type.key,
  }));
}

/** Restore units previously sold against a ref (entry delete / sale edit). */
export async function restoreUnitsForRef(
  db: Db,
  input: {
    refType: string;
    refId: string;
    actor: AuthUser;
    note?: string;
  },
) {
  const movements = await db.stockMovement.findMany({
    where: {
      type: "sale",
      refType: input.refType,
      refId: input.refId,
    },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  for (const movement of movements) {
    if (seen.has(movement.unitId)) continue;
    seen.add(movement.unitId);

    const holderId = movement.fromHolderId;
    if (!holderId) continue;

    const updated = await db.stockUnit.updateMany({
      where: { id: movement.unitId, status: "sold" },
      data: {
        status: "with_holder",
        holderUserId: holderId,
      },
    });
    if (updated.count !== 1) continue;

    await db.stockMovement.create({
      data: {
        unitId: movement.unitId,
        type: "adjust",
        fromHolderId: null,
        toHolderId: holderId,
        actorUserId: input.actor.id,
        reasonCode: "sale_restored",
        note: input.note ?? "Stock restored after log change",
        refType: input.refType,
        refId: input.refId,
      },
    });
  }

  return { restored: seen.size };
}

export async function customerReturnUnit(
  input: {
    unitId: string;
    reasonCode: string;
    condition?: string;
    note?: string;
  },
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const unit = await prisma.stockUnit.findUnique({
    where: { id: input.unitId },
    include: { type: true },
  });
  if (!unit) throw errors.notFound("Stock unit not found");
  if (unit.status !== "sold") {
    throw errors.badRequest("Only sold units can be marked as customer returns");
  }

  const saleMovement = await prisma.stockMovement.findFirst({
    where: { unitId: unit.id, type: "sale" },
    orderBy: { createdAt: "desc" },
  });
  const holderId = unit.holderUserId ?? saleMovement?.fromHolderId;
  if (!holderId) {
    throw errors.badRequest("Cannot determine holder for this return");
  }

  if (!isAdmin(actor) && holderId !== actor.id) {
    throw errors.forbidden("You can only return devices from your own sales");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.stockUnit.updateMany({
      where: { id: unit.id, status: "sold" },
      data: {
        status: "returned_by_customer",
        holderUserId: holderId,
        condition: input.condition?.trim() || unit.condition,
        notes: input.note?.trim() || unit.notes,
      },
    });
    if (updated.count !== 1) {
      throw errors.conflict("Unit status changed; refresh and retry");
    }

    await tx.stockMovement.create({
      data: {
        unitId: unit.id,
        type: "customer_return",
        fromHolderId: null,
        toHolderId: holderId,
        actorUserId: actor.id,
        reasonCode: input.reasonCode.trim(),
        note: input.note?.trim() || null,
        refType: saleMovement?.refType ?? undefined,
        refId: saleMovement?.refId ?? undefined,
      },
    });

    if (saleMovement?.refType === "sale" && saleMovement.refId) {
      await tx.sale.updateMany({
        where: { id: saleMovement.refId },
        data: {
          customerReturnedAt: new Date(),
          customerReturnReason: input.reasonCode.trim(),
        },
      });
    }

    if (
      saleMovement?.refType === "coa_evidence_client" &&
      saleMovement.refId
    ) {
      await tx.coaEvidenceClient.updateMany({
        where: { id: saleMovement.refId },
        data: {
          customerReturnedAt: new Date(),
          customerReturnReason: input.reasonCode.trim(),
        },
      });
    }
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.customer_return",
    objectType: "stock_unit",
    objectId: unit.id,
    summary: `${actor.name} recorded customer return for ${unit.serial}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return {
    id: unit.id,
    serial: unit.serial,
    status: "returned_by_customer" as const,
    type: { id: unit.type.id, key: unit.type.key, label: unit.type.label },
  };
}

/**
 * Expected stock composition for an internet logging variant.
 * Returns allowed type keys and required counts.
 */
export function expectedUnitsForInternetVariant(variantKey: string): {
  requiredCount: number;
  typeKeys: string[];
  routerTypeKey?: string;
  simTypeKey: string;
} {
  if (variantKey === "hbb") {
    return {
      requiredCount: 2,
      typeKeys: ["router_hbb", "sim_4g"],
      routerTypeKey: "router_hbb",
      simTypeKey: "sim_4g",
    };
  }
  if (variantKey === "obb") {
    return {
      requiredCount: 2,
      typeKeys: ["router_obb", "sim_4g"],
      routerTypeKey: "router_obb",
      simTypeKey: "sim_4g",
    };
  }
  // Mobile SIM
  return {
    requiredCount: 1,
    typeKeys: ["sim_4g"],
    simTypeKey: "sim_4g",
  };
}

export function assertUnitSetMatchesVariant(
  units: Array<{ serial: string; type: { key: string } }>,
  variantKey: string,
) {
  const expected = expectedUnitsForInternetVariant(variantKey);
  if (units.length !== expected.requiredCount) {
    throw errors.badRequest(
      `This activation needs ${expected.requiredCount} device serial${expected.requiredCount === 1 ? "" : "s"} from your stock`,
    );
  }
  const keys = units.map((u) => u.type.key);
  for (const typeKey of expected.typeKeys) {
    if (!keys.includes(typeKey)) {
      throw errors.badRequest(
        `Missing required device type in selection (${typeKey})`,
      );
    }
  }
  if (new Set(keys).size !== keys.length) {
    throw errors.badRequest("Each selected serial must be a different device");
  }
}
