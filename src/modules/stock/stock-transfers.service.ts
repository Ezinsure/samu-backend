import type {
  Prisma,
  StockTransferItemDecision,
  StockTransferStatus,
  UserRole,
} from "@prisma/client";
import { env } from "../../config/env.js";
import { writeAuditLog } from "../../lib/audit.js";
import { stockAssignmentEmail } from "../../lib/email-templates.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import type {
  CreateAssignmentInput,
  DeclineTransferInput,
  ListTransfersQuery,
  RespondTransferInput,
} from "./stock.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

const HOLDER_ROLES: UserRole[] = [
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
];

export function isAdmin(actor: AuthUser) {
  return actor.role === "ADMIN";
}

export function isHolderRole(role: UserRole) {
  return HOLDER_ROLES.includes(role);
}

function requireAdmin(actor: AuthUser) {
  if (!isAdmin(actor)) throw errors.forbidden("Only ADMIN can assign stock");
}

export function requireStockAccess(actor: AuthUser) {
  if (!isAdmin(actor) && !isHolderRole(actor.role)) {
    throw errors.forbidden("Stock access is limited to Admin, TC, and COA");
  }
}

export const transferInclude = {
  toUser: { select: { id: true, name: true, email: true, role: true } },
  fromUser: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      unit: {
        select: {
          id: true,
          serial: true,
          status: true,
          condition: true,
          type: { select: { id: true, key: true, label: true } },
        },
      },
    },
  },
  events: {
    orderBy: { createdAt: "desc" as const },
    take: 50,
    include: {
      actor: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.StockTransferInclude;

export function toPublicTransfer(
  row: Prisma.StockTransferGetPayload<{ include: typeof transferInclude }>,
) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    revision: row.revision,
    confirmedRevision: row.confirmedRevision ?? undefined,
    holderConfirmedRevision: row.holderConfirmedRevision ?? undefined,
    officeConfirmedRevision: row.officeConfirmedRevision ?? undefined,
    reasonCode: row.reasonCode ?? undefined,
    note: row.note ?? undefined,
    fromUser: row.fromUser,
    toUser: row.toUser,
    createdBy: row.createdBy,
    respondedAt: row.respondedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      unitId: item.unitId,
      serial: item.serialSnapshot,
      typeKey: item.typeKeySnapshot,
      typeLabel: item.typeLabelSnapshot,
      condition: item.condition ?? undefined,
      decision: item.decision,
      decisionNote: item.decisionNote ?? undefined,
      unit: {
        id: item.unit.id,
        serial: item.unit.serial,
        status: item.unit.status,
        condition: item.unit.condition ?? undefined,
        type: item.unit.type,
      },
    })),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      note: event.note ?? undefined,
      revision: event.revision ?? undefined,
      payload:
        event.payload &&
        typeof event.payload === "object" &&
        !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : undefined,
      actor: event.actor,
      createdAt: event.createdAt.toISOString(),
    })),
    itemCount: row.items.length,
    holderConfirmed: row.holderConfirmedRevision === row.revision,
    officeConfirmed: row.officeConfirmedRevision === row.revision,
  };
}

export async function loadTransferOrThrow(id: string) {
  const row = await prisma.stockTransfer.findUnique({
    where: { id },
    include: transferInclude,
  });
  if (!row) throw errors.notFound("Transfer not found");
  return row;
}

export function assertCanViewTransfer(
  transfer: { toUserId: string; createdByUserId: string; fromUserId: string | null },
  actor: AuthUser,
) {
  if (isAdmin(actor)) return;
  if (transfer.toUserId === actor.id) return;
  if (transfer.createdByUserId === actor.id) return;
  if (transfer.fromUserId === actor.id) return;
  throw errors.forbidden("You cannot view this transfer");
}

export function summarizeTypes(
  items: Array<{ typeLabelSnapshot: string }>,
): string {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(
      item.typeLabelSnapshot,
      (counts.get(item.typeLabelSnapshot) ?? 0) + 1,
    );
  }
  return [...counts.entries()]
    .map(([label, count]) => `${count}× ${label}`)
    .join(", ");
}

export async function listAssignableHolders(actor: AuthUser) {
  requireAdmin(actor);
  const rows = await prisma.user.findMany({
    where: {
      role: { in: HOLDER_ROLES },
      status: "active",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      workingDistrict: true,
      workingProvince: true,
    },
    orderBy: [{ name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    workingDistrict: row.workingDistrict ?? undefined,
    workingProvince: row.workingProvince ?? undefined,
  }));
}

export async function createAssignment(
  input: CreateAssignmentInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);

  const holder = await prisma.user.findUnique({
    where: { id: input.toUserId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
  });
  if (!holder || holder.status !== "active" || !isHolderRole(holder.role)) {
    throw errors.badRequest(
      "Assignee must be an active Territory Coordinator or COA",
    );
  }

  let units = await prisma.stockUnit.findMany({
    where: input.unitIds?.length
      ? { id: { in: input.unitIds } }
      : {
          status: "in_warehouse",
          holderUserId: null,
          type: { key: input.typeKey! },
        },
    include: { type: true },
    orderBy: [{ createdAt: "asc" }],
    take: input.unitIds?.length ? undefined : input.quantity,
  });

  if (input.unitIds?.length) {
    const found = new Set(units.map((u) => u.id));
    const missing = input.unitIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw errors.badRequest("One or more selected units were not found");
    }
    const notReady = units.filter(
      (u) => u.status !== "in_warehouse" || u.holderUserId !== null,
    );
    if (notReady.length > 0) {
      throw errors.badRequest(
        `These serials are not in warehouse: ${notReady
          .map((u) => u.serial)
          .join(", ")}`,
      );
    }
  } else if (units.length < (input.quantity ?? 0)) {
    throw errors.badRequest(
      `Only ${units.length} warehouse unit(s) available for this type`,
    );
  }

  // Guard against units already on another pending assignment.
  const busy = await prisma.stockTransferItem.findMany({
    where: {
      unitId: { in: units.map((u) => u.id) },
      transfer: { status: "pending", kind: "assignment" },
    },
    select: { unit: { select: { serial: true } } },
  });
  if (busy.length > 0) {
    throw errors.conflict(
      `Already on a pending assignment: ${busy
        .map((b) => b.unit.serial)
        .join(", ")}`,
    );
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const created = await tx.stockTransfer.create({
      data: {
        kind: "assignment",
        status: "pending",
        fromUserId: null,
        toUserId: holder.id,
        createdByUserId: actor.id,
        note: input.note?.trim() || null,
        reasonCode: input.reasonCode?.trim() || "warehouse_assign",
        items: {
          create: units.map((unit) => ({
            unitId: unit.id,
            serialSnapshot: unit.serial,
            typeKeySnapshot: unit.type.key,
            typeLabelSnapshot: unit.type.label,
            condition: unit.condition,
          })),
        },
        events: {
          create: {
            type: "created",
            actorUserId: actor.id,
            revision: 1,
            note: input.note?.trim() || null,
            payload: {
              itemCount: units.length,
              toUserId: holder.id,
            },
          },
        },
      },
    });

    for (const unit of units) {
      const updated = await tx.stockUnit.updateMany({
        where: {
          id: unit.id,
          status: "in_warehouse",
          holderUserId: null,
        },
        data: {
          status: "in_transit",
          holderUserId: holder.id,
        },
      });
      if (updated.count !== 1) {
        throw errors.conflict(
          `Unit ${unit.serial} changed during assignment; retry`,
        );
      }
      await tx.stockMovement.create({
        data: {
          unitId: unit.id,
          type: "assign",
          fromHolderId: null,
          toHolderId: holder.id,
          actorUserId: actor.id,
          reasonCode: input.reasonCode?.trim() || "warehouse_assign",
          note: input.note?.trim() || null,
          refType: "stock_transfer",
          refId: created.id,
        },
      });
    }

    return created.id;
  });

  const full = await loadTransferOrThrow(transfer);

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.transfer_assign",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} assigned ${full.items.length} unit(s) to ${holder.name}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  try {
    await sendMail(
      stockAssignmentEmail({
        to: holder.email,
        name: holder.name,
        assignedByName: actor.name,
        itemCount: full.items.length,
        typeSummary: summarizeTypes(full.items),
        note: input.note,
        confirmUrl: `${env.FRONTEND_ORIGIN}/my-stock/incoming/${full.id}`,
      }),
    );
  } catch (error) {
    logger.warn(
      { err: error, transferId: full.id, to: holder.email },
      "Failed to send stock assignment email",
    );
  }

  return toPublicTransfer(full);
}

export async function listTransfers(
  query: ListTransfersQuery,
  actor: AuthUser,
) {
  requireStockAccess(actor);

  const where: Prisma.StockTransferWhereInput = {};
  if (query.kind) where.kind = query.kind;
  if (query.status) where.status = query.status;

  if (isAdmin(actor)) {
    if (query.toUserId) where.toUserId = query.toUserId;
    if (query.fromUserId) where.fromUserId = query.fromUserId;
    if (query.mine) where.OR = [{ toUserId: actor.id }, { fromUserId: actor.id }];
  } else {
    where.OR = [{ toUserId: actor.id }, { fromUserId: actor.id }];
  }

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.stockTransfer.count({ where }),
    prisma.stockTransfer.findMany({
      where,
      include: transferInclude,
      orderBy: [{ createdAt: "desc" }],
      skip,
      take: query.pageSize,
    }),
  ]);

  return {
    data: rows.map(toPublicTransfer),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getTransfer(id: string, actor: AuthUser) {
  requireStockAccess(actor);
  const row = await loadTransferOrThrow(id);
  assertCanViewTransfer(row, actor);
  return toPublicTransfer(row);
}

export async function acceptAllTransfer(
  id: string,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const row = await loadTransferOrThrow(id);
  assertCanViewTransfer(row, actor);
  if (row.toUserId !== actor.id && !isAdmin(actor)) {
    throw errors.forbidden("Only the assigned holder can accept this transfer");
  }
  if (row.status !== "pending") {
    throw errors.badRequest("Transfer is no longer pending");
  }

  return respondToTransfer(
    id,
    {
      decisions: row.items.map((item) => ({
        itemId: item.id,
        decision: "accepted" as const,
      })),
    },
    actor,
    meta,
  );
}

export async function declineTransfer(
  id: string,
  input: DeclineTransferInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const row = await loadTransferOrThrow(id);
  assertCanViewTransfer(row, actor);
  if (row.toUserId !== actor.id && !isAdmin(actor)) {
    throw errors.forbidden("Only the assigned holder can decline this transfer");
  }
  if (row.status !== "pending") {
    throw errors.badRequest("Transfer is no longer pending");
  }

  return respondToTransfer(
    id,
    {
      decisions: row.items.map((item) => ({
        itemId: item.id,
        decision: "declined" as const,
        note: input.note,
      })),
      note: input.note,
    },
    actor,
    meta,
  );
}

export async function respondToTransfer(
  id: string,
  input: RespondTransferInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireStockAccess(actor);
  const row = await loadTransferOrThrow(id);
  assertCanViewTransfer(row, actor);

  if (row.toUserId !== actor.id && !isAdmin(actor)) {
    throw errors.forbidden("Only the assigned holder can respond to this transfer");
  }
  if (row.kind !== "assignment") {
    throw errors.badRequest("Only assignment transfers can be responded to here");
  }
  if (row.status !== "pending") {
    throw errors.badRequest("Transfer is no longer pending");
  }

  const decisionByItem = new Map(
    input.decisions.map((d) => [d.itemId, d] as const),
  );
  if (decisionByItem.size !== row.items.length) {
    throw errors.badRequest("Provide a decision for every line item");
  }
  for (const item of row.items) {
    if (!decisionByItem.has(item.id)) {
      throw errors.badRequest(`Missing decision for serial ${item.serialSnapshot}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    let accepted = 0;
    let rejected = 0;

    for (const item of row.items) {
      const decision = decisionByItem.get(item.id)!;
      const itemDecision = decision.decision as StockTransferItemDecision;
      await tx.stockTransferItem.update({
        where: { id: item.id },
        data: {
          decision: itemDecision,
          decisionNote: decision.note?.trim() || null,
        },
      });

      if (itemDecision === "accepted") {
        accepted += 1;
        const updated = await tx.stockUnit.updateMany({
          where: {
            id: item.unitId,
            status: "in_transit",
            holderUserId: row.toUserId,
          },
          data: { status: "with_holder" },
        });
        if (updated.count !== 1) {
          throw errors.conflict(
            `Unit ${item.serialSnapshot} is no longer in transit; retry`,
          );
        }
        await tx.stockMovement.create({
          data: {
            unitId: item.unitId,
            type: "accept",
            fromHolderId: row.toUserId,
            toHolderId: row.toUserId,
            actorUserId: actor.id,
            reasonCode: "assignment_accepted",
            note: decision.note?.trim() || input.note?.trim() || null,
            refType: "stock_transfer",
            refId: row.id,
          },
        });
      } else {
        rejected += 1;
        const updated = await tx.stockUnit.updateMany({
          where: {
            id: item.unitId,
            status: "in_transit",
            holderUserId: row.toUserId,
          },
          data: {
            status: "in_warehouse",
            holderUserId: null,
          },
        });
        if (updated.count !== 1) {
          throw errors.conflict(
            `Unit ${item.serialSnapshot} is no longer in transit; retry`,
          );
        }
        await tx.stockMovement.create({
          data: {
            unitId: item.unitId,
            type: "decline",
            fromHolderId: row.toUserId,
            toHolderId: null,
            actorUserId: actor.id,
            reasonCode:
              itemDecision === "missing"
                ? "assignment_missing"
                : itemDecision === "wrong"
                  ? "assignment_wrong"
                  : "assignment_declined",
            note: decision.note?.trim() || input.note?.trim() || null,
            refType: "stock_transfer",
            refId: row.id,
          },
        });
      }
    }

    let status: StockTransferStatus = "declined";
    if (accepted > 0 && rejected === 0) status = "accepted";
    else if (accepted > 0 && rejected > 0) status = "partially_accepted";

    await tx.stockTransfer.update({
      where: { id: row.id },
      data: {
        status,
        respondedAt: new Date(),
        note: input.note?.trim() || row.note,
      },
    });

    await tx.stockTransferEvent.create({
      data: {
        transferId: row.id,
        type: status === "accepted" ? "accepted" : status === "declined" ? "declined" : "partially_accepted",
        actorUserId: actor.id,
        revision: row.revision,
        note: input.note?.trim() || null,
        payload: { accepted, rejected },
      },
    });
  });

  const full = await loadTransferOrThrow(id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.transfer_respond",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} responded to assignment ${full.id} (${full.status}).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicTransfer(full);
}

export async function getHolderBreakdown(actor: AuthUser) {
  requireAdmin(actor);

  const holders = await prisma.user.findMany({
    where: {
      role: { in: HOLDER_ROLES },
      OR: [
        { stockUnitsHeld: { some: {} } },
        { stockTransfersTo: { some: { status: "pending", kind: "assignment" } } },
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      workingDistrict: true,
    },
    orderBy: [{ name: "asc" }],
  });

  const grouped = await prisma.stockUnit.groupBy({
    by: ["holderUserId", "status"],
    where: { holderUserId: { in: holders.map((h) => h.id) } },
    _count: { _all: true },
  });

  const pendingCounts = await prisma.stockTransfer.groupBy({
    by: ["toUserId"],
    where: {
      kind: "assignment",
      status: "pending",
      toUserId: { in: holders.map((h) => h.id) },
    },
    _count: { _all: true },
  });
  const pendingMap = new Map(
    pendingCounts.map((row) => [row.toUserId, row._count._all]),
  );

  return holders.map((holder) => {
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      if (row.holderUserId !== holder.id) continue;
      byStatus[row.status] = row._count._all;
      total += row._count._all;
    }
    return {
      holder: {
        id: holder.id,
        name: holder.name,
        email: holder.email,
        role: holder.role,
        workingDistrict: holder.workingDistrict ?? undefined,
      },
      total,
      byStatus: {
        in_transit: byStatus.in_transit ?? 0,
        with_holder: byStatus.with_holder ?? 0,
        sold: byStatus.sold ?? 0,
        returned_by_customer: byStatus.returned_by_customer ?? 0,
        damaged: byStatus.damaged ?? 0,
      },
      pendingAssignments: pendingMap.get(holder.id) ?? 0,
    };
  });
}
