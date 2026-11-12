import type { Prisma, StockUnitStatus } from "@prisma/client";
import { env } from "../../config/env.js";
import { writeAuditLog } from "../../lib/audit.js";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { sendMail } from "../../lib/mailer.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";
import type { AgingQuery, ExportQuery } from "./stock.schemas.js";

type RequestMeta = { ip?: string; userAgent?: string };

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can view stock reports");
  }
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [headers.map(csvEscape).join(",")]
    .concat(rows.map((row) => row.map(csvEscape).join(",")))
    .join("\n");
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export async function getReportsWorkspace(actor: AuthUser, agingDays = 30) {
  requireAdmin(actor);

  const [
    overviewGrouped,
    warehouseByType,
    types,
    openReturns,
    declinedAssignments,
    flaggedItems,
    damagedUnits,
  ] = await Promise.all([
    prisma.stockUnit.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.stockUnit.groupBy({
      by: ["typeId"],
      where: { status: "in_warehouse" },
      _count: { _all: true },
    }),
    prisma.stockItemType.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.stockTransfer.count({
      where: { kind: "return", status: { in: ["draft", "pending"] } },
    }),
    prisma.stockTransfer.count({
      where: {
        kind: "assignment",
        status: { in: ["declined", "partially_accepted"] },
      },
    }),
    prisma.stockTransferItem.count({
      where: {
        decision: { in: ["missing", "wrong"] },
        transfer: {
          OR: [
            { kind: "assignment", status: { in: ["declined", "partially_accepted", "accepted"] } },
            { kind: "return", status: { in: ["pending", "partially_accepted", "accepted", "declined"] } },
          ],
        },
      },
    }),
    prisma.stockUnit.count({ where: { status: "damaged" } }),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of overviewGrouped) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  const warehouseMap = new Map(
    warehouseByType.map((row) => [row.typeId, row._count._all]),
  );
  const lowStock = types
    .map((type) => {
      const inWarehouse = warehouseMap.get(type.id) ?? 0;
      return {
        type: { id: type.id, key: type.key, label: type.label },
        inWarehouse,
        threshold: type.lowStockThreshold,
        isLow: inWarehouse <= type.lowStockThreshold,
      };
    })
    .filter((row) => row.isLow);

  const aging = await getAgingReport(actor, { days: agingDays });

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
    agingDays,
    agingCount: aging.total,
    lowStockCount: lowStock.length,
    lowStock,
    discrepancies: {
      openReturns,
      declinedAssignments,
      flaggedItems,
      damagedUnits,
      total: openReturns + declinedAssignments + flaggedItems + damagedUnits,
    },
  };
}

export async function getAgingReport(actor: AuthUser, query: AgingQuery) {
  requireAdmin(actor);
  const now = new Date();
  const cutoff = new Date(now.getTime() - query.days * 24 * 60 * 60 * 1000);
  const statuses: StockUnitStatus[] = query.status
    ? [query.status]
    : ["with_holder", "in_transit", "returned_by_customer"];

  const units = await prisma.stockUnit.findMany({
    where: {
      status: { in: statuses },
      holderUserId: { not: null },
      updatedAt: { lte: cutoff },
    },
    include: {
      type: { select: { id: true, key: true, label: true } },
      holder: { select: { id: true, name: true, email: true, role: true } },
      movements: {
        where: { type: { in: ["accept", "assign", "customer_return"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "asc" }],
    take: 500,
  });

  const rows = units
    .map((unit) => {
      const heldSince = unit.movements[0]?.createdAt ?? unit.updatedAt;
      const ageDays = daysBetween(heldSince, now);
      return {
        id: unit.id,
        serial: unit.serial,
        status: unit.status,
        condition: unit.condition ?? undefined,
        type: unit.type,
        holder: unit.holder,
        heldSince: heldSince.toISOString(),
        ageDays,
      };
    })
    .filter((row) => row.ageDays >= query.days)
    .sort((a, b) => b.ageDays - a.ageDays);

  return {
    days: query.days,
    total: rows.length,
    rows,
  };
}

export async function getLowStockReport(actor: AuthUser) {
  requireAdmin(actor);
  const types = await prisma.stockItemType.findMany({
    where: { enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  const warehouse = await prisma.stockUnit.groupBy({
    by: ["typeId"],
    where: { status: "in_warehouse" },
    _count: { _all: true },
  });
  const map = new Map(warehouse.map((row) => [row.typeId, row._count._all]));

  const rows = types.map((type) => {
    const inWarehouse = map.get(type.id) ?? 0;
    return {
      type: { id: type.id, key: type.key, label: type.label },
      inWarehouse,
      threshold: type.lowStockThreshold,
      isLow: inWarehouse <= type.lowStockThreshold,
      deficit: Math.max(0, type.lowStockThreshold - inWarehouse),
    };
  });

  return {
    totalTypes: rows.length,
    lowCount: rows.filter((r) => r.isLow).length,
    rows,
  };
}

export async function getDiscrepancies(actor: AuthUser) {
  requireAdmin(actor);

  const [declinedAssignments, openReturns, flaggedItems, damagedUnits] =
    await Promise.all([
      prisma.stockTransfer.findMany({
        where: {
          kind: "assignment",
          status: { in: ["declined", "partially_accepted"] },
        },
        include: {
          toUser: { select: { id: true, name: true, email: true, role: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          items: {
            where: { decision: { in: ["missing", "wrong", "declined"] } },
            take: 20,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.stockTransfer.findMany({
        where: { kind: "return", status: { in: ["draft", "pending"] } },
        include: {
          fromUser: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: { select: { id: true, name: true, email: true } },
          items: { take: 20 },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
      prisma.stockTransferItem.findMany({
        where: {
          decision: { in: ["missing", "wrong"] },
        },
        include: {
          transfer: {
            select: {
              id: true,
              kind: true,
              status: true,
              updatedAt: true,
            },
          },
          unit: {
            select: {
              id: true,
              serial: true,
              status: true,
              type: { select: { key: true, label: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      prisma.stockUnit.findMany({
        where: { status: "damaged" },
        include: {
          type: { select: { id: true, key: true, label: true } },
          holder: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      }),
    ]);

  return {
    declinedAssignments: declinedAssignments.map((row) => ({
      id: row.id,
      status: row.status,
      toUser: row.toUser,
      createdBy: row.createdBy,
      reasonCode: row.reasonCode ?? undefined,
      note: row.note ?? undefined,
      flaggedItemCount: row.items.length,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    openReturns: openReturns.map((row) => ({
      id: row.id,
      status: row.status,
      revision: row.revision,
      fromUser: row.fromUser,
      createdBy: row.createdBy,
      reasonCode: row.reasonCode ?? undefined,
      itemCount: row.items.length,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    flaggedSerials: flaggedItems.map((item) => ({
      itemId: item.id,
      decision: item.decision,
      decisionNote: item.decisionNote ?? undefined,
      serial: item.serialSnapshot,
      typeKey: item.typeKeySnapshot,
      typeLabel: item.typeLabelSnapshot,
      transfer: item.transfer,
      unit: item.unit,
      updatedAt: item.updatedAt.toISOString(),
    })),
    damagedUnits: damagedUnits.map((unit) => ({
      id: unit.id,
      serial: unit.serial,
      condition: unit.condition ?? undefined,
      notes: unit.notes ?? undefined,
      type: unit.type,
      holder: unit.holder,
      updatedAt: unit.updatedAt.toISOString(),
    })),
  };
}

export async function exportStockCsv(actor: AuthUser, query: ExportQuery) {
  requireAdmin(actor);

  if (query.kind === "by_holder") {
    const units = await prisma.stockUnit.findMany({
      where: {
        holderUserId: query.holderUserId || { not: null },
        ...(query.typeKey ? { type: { key: query.typeKey } } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      include: {
        type: true,
        holder: { select: { name: true, email: true, role: true } },
      },
      orderBy: [{ holderUserId: "asc" }, { serial: "asc" }],
      take: 10_000,
    });

    const csv = toCsv(
      [
        "holder_name",
        "holder_email",
        "holder_role",
        "type",
        "serial",
        "status",
        "condition",
        "updated_at",
      ],
      units.map((u) => [
        u.holder?.name,
        u.holder?.email,
        u.holder?.role,
        u.type.label,
        u.serial,
        u.status,
        u.condition,
        u.updatedAt.toISOString(),
      ]),
    );
    return {
      filename: `stock-by-holder-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    };
  }

  if (query.kind === "movements") {
    const since = query.days
      ? new Date(Date.now() - query.days * 24 * 60 * 60 * 1000)
      : undefined;
    const movements = await prisma.stockMovement.findMany({
      where: since ? { createdAt: { gte: since } } : undefined,
      include: {
        unit: {
          include: { type: true },
        },
        actor: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20_000,
    });

    const csv = toCsv(
      [
        "created_at",
        "type",
        "serial",
        "device_type",
        "from_holder_id",
        "to_holder_id",
        "actor",
        "reason_code",
        "note",
        "ref_type",
        "ref_id",
      ],
      movements.map((m) => [
        m.createdAt.toISOString(),
        m.type,
        m.unit.serial,
        m.unit.type.label,
        m.fromHolderId,
        m.toHolderId,
        m.actor.name,
        m.reasonCode,
        m.note,
        m.refType,
        m.refId,
      ]),
    );
    return {
      filename: `stock-movements-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    };
  }

  // units / global stock
  const where: Prisma.StockUnitWhereInput = {};
  if (query.typeKey) where.type = { key: query.typeKey };
  if (query.status) where.status = query.status;
  if (query.holderUserId) where.holderUserId = query.holderUserId;

  const units = await prisma.stockUnit.findMany({
    where,
    include: {
      type: true,
      holder: { select: { name: true, email: true, role: true } },
    },
    orderBy: [{ type: { sortOrder: "asc" } }, { serial: "asc" }],
    take: 20_000,
  });

  const csv = toCsv(
    [
      "type",
      "type_key",
      "serial",
      "status",
      "holder_name",
      "holder_email",
      "condition",
      "notes",
      "created_at",
      "updated_at",
    ],
    units.map((u) => [
      u.type.label,
      u.type.key,
      u.serial,
      u.status,
      u.holder?.name,
      u.holder?.email,
      u.condition,
      u.notes,
      u.createdAt.toISOString(),
      u.updatedAt.toISOString(),
    ]),
  );

  return {
    filename: `stock-units-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  };
}

/** Manual admin digest of stock health (optional Phase 6). */
export async function sendStockDigest(
  actor: AuthUser,
  meta?: RequestMeta,
) {
  requireAdmin(actor);
  const workspace = await getReportsWorkspace(actor, 30);
  const lowStock = await getLowStockReport(actor);

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", status: "active" },
    select: { id: true, name: true, email: true },
  });
  if (admins.length === 0) {
    throw errors.badRequest("No active admins to notify");
  }

  const lowLines = lowStock.rows
    .filter((r) => r.isLow)
    .map(
      (r) =>
        `- ${r.type.label}: ${r.inWarehouse} in warehouse (threshold ${r.threshold})`,
    )
    .join("\n");

  const text = [
    "SAMU stock digest",
    "",
    `Total units: ${workspace.total}`,
    `In warehouse: ${workspace.byStatus.in_warehouse}`,
    `In transit: ${workspace.byStatus.in_transit}`,
    `With holders: ${workspace.byStatus.with_holder}`,
    `Aging (≥30 days): ${workspace.agingCount}`,
    `Low-stock types: ${workspace.lowStockCount}`,
    `Discrepancies: ${workspace.discrepancies.total}`,
    `  Open returns: ${workspace.discrepancies.openReturns}`,
    `  Declined assignments: ${workspace.discrepancies.declinedAssignments}`,
    `  Flagged items: ${workspace.discrepancies.flaggedItems}`,
    `  Damaged units: ${workspace.discrepancies.damagedUnits}`,
    "",
    "Low stock:",
    lowLines || "- None",
    "",
    `Open reports: ${env.FRONTEND_ORIGIN}/inventory/reports`,
    "",
    "— Solektra / SAMU",
  ].join("\n");

  let delivered = 0;
  for (const admin of admins) {
    try {
      const result = await sendMail({
        to: admin.email,
        subject: `SAMU stock digest — ${workspace.discrepancies.total} discrepancies, ${workspace.lowStockCount} low-stock`,
        text,
        html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</pre>`,
      });
      if (result.delivered) delivered += 1;
    } catch (error) {
      logger.warn(
        { err: error, email: admin.email },
        "Failed to send stock digest",
      );
    }
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "stock.digest_send",
    objectType: "stock_reports",
    objectId: "digest",
    summary: `${actor.name} sent stock digest to ${admins.length} admin(s).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return {
    recipients: admins.length,
    delivered,
  };
}
