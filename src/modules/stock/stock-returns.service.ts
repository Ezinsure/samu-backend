import type { Prisma, StockTransferItemDecision } from "@prisma/client";
import { env } from "../../config/env.js";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import type {
  CancelReturnInput,
  CommentReturnInput,
  ConfirmReturnInput,
  CreateReturnInput,
  UpdateReturnInput,
} from "./stock.schemas.js";
import {
  assertCanViewTransfer,
  isAdmin,
  isHolderRole,
  loadTransferOrThrow,
  requireStockAccess,
  summarizeTypes,
  toPublicTransfer,
} from "./stock-transfers.service.js";

type RequestMeta = { ip?: string; userAgent?: string };

const RETURNABLE_STATUSES = ["with_holder", "returned_by_customer"] as const;
const OPEN_RETURN_STATUSES = ["draft", "pending"] as const;

function requireReturnParty(
  transfer: { kind: string; fromUserId: string | null; status: string },
  actor: AuthUser,
) {
  requireStockAccess(actor);
  if (transfer.kind !== "return") {
    throw errors.badRequest("This is not a return application");
  }
  if (!OPEN_RETURN_STATUSES.includes(transfer.status as (typeof OPEN_RETURN_STATUSES)[number]) &&
      transfer.status !== "accepted" &&
      transfer.status !== "cancelled") {
    // allow view of closed; mutations check separately
  }
}

function assertCanEditReturn(
  transfer: { fromUserId: string | null; status: string },
  actor: AuthUser,
) {
  if (!OPEN_RETURN_STATUSES.includes(transfer.status as (typeof OPEN_RETURN_STATUSES)[number])) {
    throw errors.badRequest("Return is closed and cannot be edited");
  }
  if (isAdmin(actor)) return;
  if (transfer.fromUserId === actor.id) return;
  throw errors.forbidden("Only the holder or an admin can edit this return");
}

async function resolveOfficeAdmin(preferredId?: string) {
  if (preferredId) {
    const preferred = await prisma.user.findFirst({
      where: { id: preferredId, role: "ADMIN", status: "active" },
      select: { id: true, name: true, email: true },
    });
    if (preferred) return preferred;
  }
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
  if (!admin) throw errors.badRequest("No active admin is available to receive returns");
  return admin;
}

async function assertReturnableUnits(unitIds: string[], holderUserId: string) {
  const unique = [...new Set(unitIds)];
  const units = await prisma.stockUnit.findMany({
    where: { id: { in: unique } },
    include: { type: true },
  });
  if (units.length !== unique.length) {
    throw errors.badRequest("One or more selected units were not found");
  }

  for (const unit of units) {
    if (unit.holderUserId !== holderUserId) {
      throw errors.forbidden(`Unit ${unit.serial} is not in the holder's stock`);
    }
    if (
      !RETURNABLE_STATUSES.includes(
        unit.status as (typeof RETURNABLE_STATUSES)[number],
      )
    ) {
      throw errors.badRequest(
        `Unit ${unit.serial} cannot be returned (status: ${unit.status})`,
      );
    }
  }

  const busy = await prisma.stockTransferItem.findMany({
    where: {
      unitId: { in: unique },
      transfer: {
        kind: "return",
        status: { in: [...OPEN_RETURN_STATUSES] },
      },
    },
    select: {
      transferId: true,
      unit: { select: { serial: true } },
    },
  });
  if (busy.length > 0) {
    throw errors.conflict(
      `Already on an open return: ${busy.map((b) => b.unit.serial).join(", ")}`,
    );
  }

  return units;
}

/** Units locked on an open return application. */
export async function findUnitsOnOpenReturn(unitIds: string[]) {
  if (unitIds.length === 0) return [];
  return prisma.stockTransferItem.findMany({
    where: {
      unitId: { in: unitIds },
      transfer: { kind: "return", status: { in: [...OPEN_RETURN_STATUSES] } },
    },
    select: { unitId: true, unit: { select: { serial: true } } },
  });
}

export async function createReturn(
  input: CreateReturnInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireStockAccess(actor);

  const holderId =
    isAdmin(actor) && input.unitIds.length > 0
      ? (
          await prisma.stockUnit.findUnique({
            where: { id: input.unitIds[0] },
            select: { holderUserId: true },
          })
        )?.holderUserId
      : actor.id;

  if (!holderId) throw errors.badRequest("Selected units have no holder");
  if (!isAdmin(actor) && holderId !== actor.id) {
    throw errors.forbidden("You can only return your own stock");
  }
  if (!isAdmin(actor) && !isHolderRole(actor.role)) {
    throw errors.forbidden();
  }

  const holder = await prisma.user.findUnique({
    where: { id: holderId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!holder || holder.status !== "active" || !isHolderRole(holder.role)) {
    throw errors.badRequest("Holder must be an active TC or COA");
  }

  const itemMeta = new Map(
    (input.items ?? []).map((item) => [item.unitId, item] as const),
  );
  const units = await assertReturnableUnits(input.unitIds, holderId);
  const office = await resolveOfficeAdmin(isAdmin(actor) ? actor.id : undefined);
  const status = input.submit ? "pending" : "draft";

  const transferId = await prisma.$transaction(async (tx) => {
    const created = await tx.stockTransfer.create({
      data: {
        kind: "return",
        status,
        fromUserId: holder.id,
        toUserId: office.id,
        createdByUserId: actor.id,
        reasonCode: input.reasonCode,
        note: input.note?.trim() || null,
        revision: 1,
        holderConfirmedRevision: status === "pending" ? 1 : null,
        officeConfirmedRevision: null,
        items: {
          create: units.map((unit) => {
            const metaItem = itemMeta.get(unit.id);
            return {
              unitId: unit.id,
              serialSnapshot: unit.serial,
              typeKeySnapshot: unit.type.key,
              typeLabelSnapshot: unit.type.label,
              condition: metaItem?.condition?.trim() || unit.condition,
              decisionNote: metaItem?.note?.trim() || null,
            };
          }),
        },
        events: {
          create: {
            type: status === "pending" ? "submitted" : "draft_created",
            actorUserId: actor.id,
            revision: 1,
            note: input.note?.trim() || null,
            payload: {
              itemCount: units.length,
              reasonCode: input.reasonCode,
            },
          },
        },
      },
    });
    return created.id;
  });

  const full = await loadTransferOrThrow(transferId);

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.return_create",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} ${status === "pending" ? "submitted" : "drafted"} a return of ${full.items.length} unit(s).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  if (status === "pending") {
    try {
      await sendMail({
        to: office.email,
        subject: `SAMU: return application from ${holder.name}`,
        text: [
          `Hello ${office.name},`,
          "",
          `${holder.name} submitted a return of ${full.items.length} device(s).`,
          `Devices: ${summarizeTypes(full.items)}`,
          `Reason: ${input.reasonCode}`,
          input.note ? `Note: ${input.note}` : null,
          "",
          `Review: ${env.FRONTEND_ORIGIN}/inventory/returns/${full.id}`,
          "",
          "— Solektra / SAMU",
        ]
          .filter((line) => line !== null)
          .join("\n"),
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <h2>SAMU return application</h2>
  <p><strong>${holder.name}</strong> submitted <strong>${full.items.length}</strong> device(s) for return.</p>
  <p>Devices: ${summarizeTypes(full.items)}<br/>Reason: ${input.reasonCode}</p>
  <p><a href="${env.FRONTEND_ORIGIN}/inventory/returns/${full.id}">Review return</a></p>
</div>`,
      });
    } catch (error) {
      logger.warn(
        { err: error, transferId: full.id },
        "Failed to send return notification email",
      );
    }
  }

  return toPublicTransfer(full);
}

export async function updateReturn(
  id: string,
  input: UpdateReturnInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const existing = await loadTransferOrThrow(id);
  assertCanViewTransfer(existing, actor);
  requireReturnParty(existing, actor);
  assertCanEditReturn(existing, actor);

  if (!existing.fromUserId) {
    throw errors.badRequest("Return has no holder");
  }

  const nextUnitIds =
    input.unitIds ??
    input.items?.map((i) => i.unitId) ??
    existing.items.map((i) => i.unitId);

  // Allow current transfer's units when re-validating.
  const foreignBusy = await prisma.stockTransferItem.findMany({
    where: {
      unitId: { in: nextUnitIds },
      transferId: { not: id },
      transfer: { kind: "return", status: { in: [...OPEN_RETURN_STATUSES] } },
    },
    select: { unit: { select: { serial: true } } },
  });
  if (foreignBusy.length > 0) {
    throw errors.conflict(
      `Already on another open return: ${foreignBusy
        .map((b) => b.unit.serial)
        .join(", ")}`,
    );
  }

  const units = await prisma.stockUnit.findMany({
    where: { id: { in: nextUnitIds } },
    include: { type: true },
  });
  if (units.length !== nextUnitIds.length) {
    throw errors.badRequest("One or more selected units were not found");
  }
  for (const unit of units) {
    if (unit.holderUserId !== existing.fromUserId) {
      throw errors.forbidden(`Unit ${unit.serial} is not in the holder's stock`);
    }
    if (
      !RETURNABLE_STATUSES.includes(
        unit.status as (typeof RETURNABLE_STATUSES)[number],
      )
    ) {
      throw errors.badRequest(
        `Unit ${unit.serial} cannot be returned (status: ${unit.status})`,
      );
    }
  }

  const itemInput = new Map(
    (input.items ?? []).map((item) => [item.unitId, item] as const),
  );
  const previousSnapshot = {
    reasonCode: existing.reasonCode,
    note: existing.note,
    items: existing.items.map((i) => ({
      unitId: i.unitId,
      serial: i.serialSnapshot,
      condition: i.condition,
      decision: i.decision,
      decisionNote: i.decisionNote,
    })),
  };

  await prisma.$transaction(async (tx) => {
    await tx.stockTransferItem.deleteMany({ where: { transferId: id } });
    await tx.stockTransferItem.createMany({
      data: units.map((unit) => {
        const patch = itemInput.get(unit.id);
        const prior = existing.items.find((i) => i.unitId === unit.id);
        return {
          transferId: id,
          unitId: unit.id,
          serialSnapshot: unit.serial,
          typeKeySnapshot: unit.type.key,
          typeLabelSnapshot: unit.type.label,
          condition:
            patch?.condition === null
              ? null
              : patch?.condition?.trim() ||
                prior?.condition ||
                unit.condition,
          decision: (patch?.decision as StockTransferItemDecision | undefined) ??
            prior?.decision ??
            "pending",
          decisionNote:
            patch?.decisionNote === null
              ? null
              : patch?.decisionNote?.trim() || prior?.decisionNote || null,
        };
      }),
    });

    const nextRevision = existing.revision + 1;
    await tx.stockTransfer.update({
      where: { id },
      data: {
        revision: nextRevision,
        holderConfirmedRevision: null,
        officeConfirmedRevision: null,
        reasonCode: input.reasonCode ?? existing.reasonCode,
        note:
          input.note === undefined
            ? existing.note
            : input.note?.trim() || null,
      },
    });

    await tx.stockTransferEvent.create({
      data: {
        transferId: id,
        type: "edited",
        actorUserId: actor.id,
        revision: nextRevision,
        note: "Return application updated — both sides must re-confirm",
        payload: {
          previous: previousSnapshot,
          nextRevision,
        } as Prisma.InputJsonValue,
      },
    });
  });

  const full = await loadTransferOrThrow(id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.return_update",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} edited return ${full.id} (revision ${full.revision}).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return toPublicTransfer(full);
}

export async function submitReturn(
  id: string,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const existing = await loadTransferOrThrow(id);
  assertCanViewTransfer(existing, actor);
  if (existing.kind !== "return") throw errors.badRequest("Not a return");
  if (existing.status !== "draft") {
    throw errors.badRequest("Only draft returns can be submitted");
  }
  if (!isAdmin(actor) && existing.fromUserId !== actor.id) {
    throw errors.forbidden("Only the holder can submit this return");
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id },
      data: {
        status: "pending",
        holderConfirmedRevision: existing.revision,
        officeConfirmedRevision: null,
      },
    });
    await tx.stockTransferEvent.create({
      data: {
        transferId: id,
        type: "submitted",
        actorUserId: actor.id,
        revision: existing.revision,
        note: "Return submitted for office confirmation",
      },
    });
  });

  const full = await loadTransferOrThrow(id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.return_submit",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} submitted return ${full.id}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return toPublicTransfer(full);
}

export async function confirmReturn(
  id: string,
  input: ConfirmReturnInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const existing = await loadTransferOrThrow(id);
  assertCanViewTransfer(existing, actor);
  if (existing.kind !== "return") throw errors.badRequest("Not a return");
  if (existing.status !== "pending" && existing.status !== "draft") {
    throw errors.badRequest("Return is not awaiting confirmation");
  }
  if (existing.status === "draft") {
    throw errors.badRequest("Submit the draft before confirming");
  }

  const asHolder = existing.fromUserId === actor.id;
  const asOffice = isAdmin(actor);
  if (!asHolder && !asOffice) {
    throw errors.forbidden("Only the holder or an admin can confirm this return");
  }

  let finalize = false;
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.stockTransfer.findUniqueOrThrow({ where: { id } });
    const holderRev = asHolder
      ? fresh.revision
      : fresh.holderConfirmedRevision;
    const officeRev = asOffice
      ? fresh.revision
      : fresh.officeConfirmedRevision;

    await tx.stockTransfer.update({
      where: { id },
      data: {
        holderConfirmedRevision: holderRev,
        officeConfirmedRevision: officeRev,
      },
    });

    await tx.stockTransferEvent.create({
      data: {
        transferId: id,
        type: asHolder ? "holder_confirmed" : "office_confirmed",
        actorUserId: actor.id,
        revision: fresh.revision,
        note: input.note?.trim() || null,
      },
    });

    finalize =
      holderRev === fresh.revision && officeRev === fresh.revision;

    if (!finalize) return;

    const items = await tx.stockTransferItem.findMany({
      where: { transferId: id },
      include: { unit: true },
    });

    for (const item of items) {
      // Missing/wrong/declined lines stay with the holder; only accepted/pending move to warehouse.
      if (
        item.decision === "missing" ||
        item.decision === "wrong" ||
        item.decision === "declined"
      ) {
        continue;
      }

      const updated = await tx.stockUnit.updateMany({
        where: {
          id: item.unitId,
          holderUserId: existing.fromUserId,
          status: { in: [...RETURNABLE_STATUSES] },
        },
        data: {
          status: "in_warehouse",
          holderUserId: null,
          condition: item.condition,
        },
      });
      if (updated.count !== 1) {
        throw errors.conflict(
          `Unit ${item.serialSnapshot} changed during confirmation; retry`,
        );
      }

      await tx.stockMovement.create({
        data: {
          unitId: item.unitId,
          type: "return_to_office",
          fromHolderId: existing.fromUserId,
          toHolderId: null,
          actorUserId: actor.id,
          reasonCode: existing.reasonCode ?? "return_to_office",
          note: input.note?.trim() || existing.note,
          refType: "stock_transfer",
          refId: id,
        },
      });
      await tx.stockMovement.create({
        data: {
          unitId: item.unitId,
          type: "confirm_return",
          fromHolderId: existing.fromUserId,
          toHolderId: null,
          actorUserId: actor.id,
          reasonCode: "return_confirmed",
          note: `Revision ${fresh.revision} dual-confirmed`,
          refType: "stock_transfer",
          refId: id,
        },
      });
    }

    const moved = items.filter(
      (i) =>
        i.decision !== "missing" &&
        i.decision !== "wrong" &&
        i.decision !== "declined",
    ).length;
    const skipped = items.length - moved;

    await tx.stockTransfer.update({
      where: { id },
      data: {
        status: skipped > 0 && moved > 0 ? "partially_accepted" : moved > 0 ? "accepted" : "declined",
        confirmedRevision: fresh.revision,
        respondedAt: new Date(),
      },
    });

    await tx.stockTransferEvent.create({
      data: {
        transferId: id,
        type: "completed",
        actorUserId: actor.id,
        revision: fresh.revision,
        note: `Stock moved for ${moved} unit(s); ${skipped} flagged line(s) kept with holder`,
        payload: { moved, skipped },
      },
    });
  });

  const full = await loadTransferOrThrow(id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: finalize ? "stock.return_complete" : "stock.return_confirm",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: finalize
      ? `${actor.name} completed return ${full.id}.`
      : `${actor.name} confirmed return ${full.id} (awaiting other party).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return toPublicTransfer(full);
}

export async function commentReturn(
  id: string,
  input: CommentReturnInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const existing = await loadTransferOrThrow(id);
  assertCanViewTransfer(existing, actor);
  if (existing.kind !== "return") throw errors.badRequest("Not a return");

  await prisma.stockTransferEvent.create({
    data: {
      transferId: id,
      type: "comment",
      actorUserId: actor.id,
      revision: existing.revision,
      note: input.note.trim(),
    },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.return_comment",
    objectType: "stock_transfer",
    objectId: id,
    summary: `${actor.name} commented on return ${id}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return toPublicTransfer(await loadTransferOrThrow(id));
}

export async function cancelReturn(
  id: string,
  input: CancelReturnInput,
  actor: AuthUser,
  meta?: RequestMeta,
) {
  const existing = await loadTransferOrThrow(id);
  assertCanViewTransfer(existing, actor);
  if (existing.kind !== "return") throw errors.badRequest("Not a return");
  if (!OPEN_RETURN_STATUSES.includes(existing.status as (typeof OPEN_RETURN_STATUSES)[number])) {
    throw errors.badRequest("Return is already closed");
  }
  if (!isAdmin(actor) && existing.fromUserId !== actor.id) {
    throw errors.forbidden("Only the holder or an admin can cancel this return");
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockTransfer.update({
      where: { id },
      data: {
        status: "cancelled",
        respondedAt: new Date(),
      },
    });
    await tx.stockTransferEvent.create({
      data: {
        transferId: id,
        type: "cancelled",
        actorUserId: actor.id,
        revision: existing.revision,
        note: input.note?.trim() || null,
      },
    });
  });

  const full = await loadTransferOrThrow(id);
  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.return_cancel",
    objectType: "stock_transfer",
    objectId: full.id,
    summary: `${actor.name} cancelled return ${full.id}.`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });
  return toPublicTransfer(full);
}
