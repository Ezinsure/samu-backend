import type { Prisma, StockUnitStatus } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import type {
  ConfirmFaultyInput,
  DisposeFaultyInput,
  ListFaultyQuery,
} from "./stock.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

const CONFIRMABLE: StockUnitStatus[] = [
  "in_warehouse",
  "returned_by_customer",
];

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can manage the faulty queue");
  }
}

function toPublicUnit(row: {
  id: string;
  serial: string;
  status: StockUnitStatus;
  condition: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  type: { id: string; key: string; label: string };
  holder: { id: string; name: string; email: string; role: string } | null;
  intakeBatch: { id: string; label: string; receivedAt: Date } | null;
}) {
  return {
    id: row.id,
    serial: row.serial,
    status: row.status,
    condition: row.condition ?? undefined,
    notes: row.notes ?? undefined,
    type: row.type,
    holder: row.holder,
    intakeBatch: row.intakeBatch
      ? {
          id: row.intakeBatch.id,
          label: row.intakeBatch.label,
          receivedAt: row.intakeBatch.receivedAt.toISOString(),
        }
      : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Units confirmed faulty and awaiting supplier return or deactivation. */
export async function listFaultyQueue(query: ListFaultyQuery, actor: AuthUser) {
  requireAdmin(actor);

  const where: Prisma.StockUnitWhereInput = { status: "damaged" };
  if (query.typeKey) where.type = { key: query.typeKey };
  if (query.search) {
    where.OR = [
      { serial: { contains: query.search, mode: "insensitive" } },
      { notes: { contains: query.search, mode: "insensitive" } },
      { condition: { contains: query.search, mode: "insensitive" } },
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
        intakeBatch: {
          select: { id: true, label: true, receivedAt: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { serial: "asc" }],
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

/**
 * Admin confirms one or more warehouse / customer-return units as faulty.
 * They enter the disposition queue (`damaged`).
 */
export async function confirmFaulty(
  input: ConfirmFaultyInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const unitIds = [...new Set(input.unitIds.map((id) => id.trim()).filter(Boolean))];
  if (unitIds.length === 0) {
    throw errors.badRequest("Select at least one unit");
  }

  const units = await prisma.stockUnit.findMany({
    where: { id: { in: unitIds } },
    include: { type: { select: { label: true } } },
  });
  if (units.length !== unitIds.length) {
    throw errors.badRequest("One or more units were not found");
  }

  for (const unit of units) {
    if (!CONFIRMABLE.includes(unit.status)) {
      throw errors.badRequest(
        `Unit ${unit.serial} cannot be confirmed faulty from status ${unit.status}`,
      );
    }
  }

  const note = input.note?.trim() || null;
  let confirmed = 0;

  await prisma.$transaction(async (tx) => {
    for (const unit of units) {
      const updated = await tx.stockUnit.updateMany({
        where: {
          id: unit.id,
          status: { in: CONFIRMABLE },
        },
        data: {
          status: "damaged",
          holderUserId: null,
          notes: note ?? unit.notes,
        },
      });
      if (updated.count !== 1) {
        throw errors.conflict(
          `Unit ${unit.serial} changed during confirm; refresh and retry`,
        );
      }
      await tx.stockMovement.create({
        data: {
          unitId: unit.id,
          type: "adjust",
          fromHolderId: unit.holderUserId,
          toHolderId: null,
          actorUserId: actor.id,
          reasonCode: "confirm_faulty",
          note: note ?? "Admin confirmed unit as faulty",
        },
      });
      confirmed += 1;
    }
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.confirm_faulty",
    objectType: "stock_unit",
    objectId: unitIds[0],
    summary: `${actor.name} confirmed ${confirmed} unit(s) as faulty.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { confirmed };
}

/**
 * Dispose confirmed-faulty units: return to supplier or deactivate (write off).
 */
export async function disposeFaulty(
  input: DisposeFaultyInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const unitIds = [...new Set(input.unitIds.map((id) => id.trim()).filter(Boolean))];
  if (unitIds.length === 0) {
    throw errors.badRequest("Select at least one unit");
  }

  const nextStatus: StockUnitStatus =
    input.action === "return_to_supplier"
      ? "returned_to_supplier"
      : "written_off";
  const movementType =
    input.action === "return_to_supplier" ? "return_to_supplier" : "write_off";
  const reasonCode =
    input.action === "return_to_supplier"
      ? "returned_to_supplier"
      : "deactivated";

  const units = await prisma.stockUnit.findMany({
    where: { id: { in: unitIds } },
  });
  if (units.length !== unitIds.length) {
    throw errors.badRequest("One or more units were not found");
  }
  for (const unit of units) {
    if (unit.status !== "damaged") {
      throw errors.badRequest(
        `Unit ${unit.serial} is not in the faulty queue (status: ${unit.status})`,
      );
    }
  }

  const noteParts = [
    input.note?.trim(),
    input.supplierRef?.trim()
      ? `Supplier ref: ${input.supplierRef.trim()}`
      : null,
  ].filter(Boolean);
  const note = noteParts.length ? noteParts.join(" · ") : null;

  let disposed = 0;
  await prisma.$transaction(async (tx) => {
    for (const unit of units) {
      const updated = await tx.stockUnit.updateMany({
        where: { id: unit.id, status: "damaged" },
        data: {
          status: nextStatus,
          holderUserId: null,
          notes: note ?? unit.notes,
        },
      });
      if (updated.count !== 1) {
        throw errors.conflict(
          `Unit ${unit.serial} changed during disposition; refresh and retry`,
        );
      }
      await tx.stockMovement.create({
        data: {
          unitId: unit.id,
          type: movementType,
          fromHolderId: null,
          toHolderId: null,
          actorUserId: actor.id,
          reasonCode,
          note:
            note ??
            (input.action === "return_to_supplier"
              ? "Returned to supplier"
              : "Deactivated / written off"),
        },
      });
      disposed += 1;
    }
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action:
      input.action === "return_to_supplier"
        ? "stock.return_to_supplier"
        : "stock.deactivate",
    objectType: "stock_unit",
    objectId: unitIds[0],
    summary: `${actor.name} ${
      input.action === "return_to_supplier"
        ? "returned to supplier"
        : "deactivated"
    } ${disposed} faulty unit(s).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return {
    disposed,
    action: input.action,
    status: nextStatus,
  };
}
