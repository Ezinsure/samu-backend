import type {
  Prisma,
  StockBalanceMovementKind,
  StockItemType,
} from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

type Db = Prisma.TransactionClient | typeof prisma;

export const WAREHOUSE_SCOPE = "warehouse";

export function scopeKeyForHolder(holderUserId: string | null | undefined): string {
  return holderUserId ? holderUserId : WAREHOUSE_SCOPE;
}

export function isQuantityTracked(
  type: Pick<StockItemType, "trackingMode">,
): boolean {
  return type.trackingMode === "quantity";
}

async function getOrCreateBalance(
  db: Db,
  typeId: string,
  holderUserId: string | null,
) {
  const scopeKey = scopeKeyForHolder(holderUserId);
  const existing = await db.stockBalance.findUnique({
    where: { typeId_scopeKey: { typeId, scopeKey } },
  });
  if (existing) return existing;
  return db.stockBalance.create({
    data: {
      typeId,
      holderUserId,
      scopeKey,
      quantity: 0,
      reservedQuantity: 0,
    },
  });
}

export async function getAvailableQuantity(
  db: Db,
  typeId: string,
  holderUserId: string | null,
): Promise<number> {
  const scopeKey = scopeKeyForHolder(holderUserId);
  const row = await db.stockBalance.findUnique({
    where: { typeId_scopeKey: { typeId, scopeKey } },
    select: { quantity: true, reservedQuantity: true },
  });
  if (!row) return 0;
  if (holderUserId == null) {
    return Math.max(0, row.quantity - row.reservedQuantity);
  }
  return Math.max(0, row.quantity);
}

export async function creditBalance(
  db: Db,
  input: {
    typeId: string;
    holderUserId: string | null;
    quantity: number;
    kind: StockBalanceMovementKind;
    actorUserId: string;
    fromHolderId?: string | null;
    toHolderId?: string | null;
    reasonCode?: string;
    note?: string | null;
    refType?: string;
    refId?: string;
    serialBound?: string;
    unitId?: string;
  },
) {
  if (input.quantity <= 0) {
    throw errors.badRequest("Quantity must be positive");
  }
  const balance = await getOrCreateBalance(db, input.typeId, input.holderUserId);
  await db.stockBalance.update({
    where: { id: balance.id },
    data: { quantity: { increment: input.quantity } },
  });
  await db.stockBalanceMovement.create({
    data: {
      typeId: input.typeId,
      quantity: input.quantity,
      kind: input.kind,
      fromHolderId: input.fromHolderId ?? null,
      toHolderId: input.toHolderId ?? input.holderUserId,
      actorUserId: input.actorUserId,
      reasonCode: input.reasonCode ?? null,
      note: input.note ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      serialBound: input.serialBound ?? null,
      unitId: input.unitId ?? null,
    },
  });
}

export async function debitBalance(
  db: Db,
  input: {
    typeId: string;
    holderUserId: string | null;
    quantity: number;
    kind: StockBalanceMovementKind;
    actorUserId: string;
    fromHolderId?: string | null;
    toHolderId?: string | null;
    reasonCode?: string;
    note?: string | null;
    refType?: string;
    refId?: string;
    serialBound?: string;
    unitId?: string;
    /** When true, ignore reserved qty (e.g. releasing reservation on accept). */
    allowReserved?: boolean;
  },
) {
  if (input.quantity <= 0) {
    throw errors.badRequest("Quantity must be positive");
  }
  const balance = await getOrCreateBalance(db, input.typeId, input.holderUserId);
  const available = input.allowReserved
    ? balance.quantity
    : input.holderUserId == null
      ? balance.quantity - balance.reservedQuantity
      : balance.quantity;
  if (available < input.quantity) {
    throw errors.badRequest(
      `Insufficient stock: need ${input.quantity}, available ${Math.max(0, available)}`,
    );
  }
  await db.stockBalance.update({
    where: { id: balance.id },
    data: { quantity: { decrement: input.quantity } },
  });
  await db.stockBalanceMovement.create({
    data: {
      typeId: input.typeId,
      quantity: input.quantity,
      kind: input.kind,
      fromHolderId: input.fromHolderId ?? input.holderUserId,
      toHolderId: input.toHolderId ?? null,
      actorUserId: input.actorUserId,
      reasonCode: input.reasonCode ?? null,
      note: input.note ?? null,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      serialBound: input.serialBound ?? null,
      unitId: input.unitId ?? null,
    },
  });
}

/** Reserve warehouse qty for a pending quantity assignment. */
export async function reserveWarehouse(
  db: Db,
  typeId: string,
  quantity: number,
) {
  const balance = await getOrCreateBalance(db, typeId, null);
  const available = balance.quantity - balance.reservedQuantity;
  if (available < quantity) {
    throw errors.badRequest(
      `Only ${Math.max(0, available)} warehouse unit(s) available for this type`,
    );
  }
  await db.stockBalance.update({
    where: { id: balance.id },
    data: { reservedQuantity: { increment: quantity } },
  });
}

export async function releaseWarehouseReservation(
  db: Db,
  typeId: string,
  quantity: number,
) {
  const balance = await getOrCreateBalance(db, typeId, null);
  const release = Math.min(quantity, balance.reservedQuantity);
  if (release <= 0) return;
  await db.stockBalance.update({
    where: { id: balance.id },
    data: { reservedQuantity: { decrement: release } },
  });
}

/**
 * Consume 1 from holder quantity balance and create a sold StockUnit with the
 * provided serial (bound at sale / activation).
 */
export async function bindSerialFromHolderBalance(
  db: Db,
  input: {
    type: StockItemType;
    holderUserId: string;
    serial: string;
    actor: AuthUser;
    refType: string;
    refId: string;
    note?: string;
    intakeBatchId?: string | null;
  },
) {
  if (!isQuantityTracked(input.type)) {
    throw errors.badRequest(`${input.type.label} is not quantity-tracked`);
  }
  const serial = input.serial.trim().toUpperCase().replace(/\s+/g, "");
  if (serial.length < 3) {
    throw errors.badRequest("SIM serial is too short");
  }

  const existing = await db.stockUnit.findUnique({
    where: {
      typeId_serial: { typeId: input.type.id, serial },
    },
    select: { id: true },
  });
  if (existing) {
    throw errors.conflict(`Serial ${serial} is already in stock`);
  }

  await debitBalance(db, {
    typeId: input.type.id,
    holderUserId: input.holderUserId,
    quantity: 1,
    kind: "sell",
    actorUserId: input.actor.id,
    fromHolderId: input.holderUserId,
    toHolderId: null,
    reasonCode: "field_sale",
    note: input.note ?? null,
    refType: input.refType,
    refId: input.refId,
    serialBound: serial,
  });

  const unit = await db.stockUnit.create({
    data: {
      typeId: input.type.id,
      serial,
      status: "sold",
      holderUserId: null,
      intakeBatchId: input.intakeBatchId ?? null,
      notes: input.note?.trim() || null,
    },
    include: { type: true },
  });

  await db.stockMovement.create({
    data: {
      unitId: unit.id,
      type: "sale",
      fromHolderId: input.holderUserId,
      toHolderId: null,
      actorUserId: input.actor.id,
      reasonCode: "field_sale",
      note: input.note ?? null,
      refType: input.refType,
      refId: input.refId,
    },
  });

  await db.stockBalanceMovement.updateMany({
    where: {
      typeId: input.type.id,
      kind: "sell",
      refType: input.refType,
      refId: input.refId,
      serialBound: serial,
      unitId: null,
    },
    data: { unitId: unit.id },
  });

  return unit;
}

export async function listBalancesForOverview() {
  return prisma.stockBalance.findMany({
    include: {
      type: { select: { id: true, key: true, label: true, trackingMode: true } },
      holder: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}
