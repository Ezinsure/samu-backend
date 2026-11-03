import { z } from "zod";
import { errors } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import type { AuthUser } from "../../types/express.js";

/** COA daily performance activity kinds aligned to Leonile duties. */
export const coaActivityKindSchema = z.enum([
  "bk_accounts",
  "irembo_recruits",
  "insurance_clients",
  "internet_subscriptions",
  "smartphone_sales",
  "induction_cooker_sales",
  "ict_training",
]);

export const fieldWorkCreateSchema = z.object({
  kind: coaActivityKindSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  peopleReached: z.number().int().min(0).max(10000),
  province: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(120),
  venue: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  outcome: z.string().trim().min(1).max(4000),
});

const KIND_TO_SERVICE = {
  bk_accounts: "bk",
  irembo_recruits: "irembo",
  insurance_clients: "insurance",
  internet_subscriptions: "internet",
  smartphone_sales: "device_financing",
  induction_cooker_sales: "clean_cooking",
  ict_training: "irembo",
} as const;

export async function createFieldWork(
  input: z.infer<typeof fieldWorkCreateSchema>,
  actor: AuthUser,
) {
  if (
    actor.role !== "COMMUNITY_OPPORTUNITY_ASSOCIATE" &&
    actor.role !== "ADMIN"
  ) {
    throw errors.forbidden();
  }

  const ownerId =
    actor.role === "ADMIN" ? actor.id : actor.id;

  const id = `fa-coa-${Date.now()}`;
  const row = await prisma.fieldActivity.create({
    data: {
      id,
      tcUserId: ownerId,
      serviceLine: KIND_TO_SERVICE[input.kind],
      activityType:
        input.kind === "ict_training"
          ? "education"
          : input.kind.includes("sales") || input.kind === "bk_accounts"
            ? "mobilization"
            : "campaign",
      date: new Date(`${input.date}T00:00:00.000Z`),
      geoProvince: input.province,
      geoDistrict: input.district,
      geoSector: input.sector,
      venue: input.venue,
      peopleReached: input.peopleReached,
      summary: `[${input.kind}] ${input.summary}`,
      outcome: input.outcome,
    },
  });

  return {
    id: row.id,
    kind: input.kind,
    date: input.date,
    peopleReached: row.peopleReached,
    summary: row.summary,
    outcome: row.outcome,
  };
}

export async function listMyFieldWork(actor: AuthUser) {
  if (
    actor.role !== "COMMUNITY_OPPORTUNITY_ASSOCIATE" &&
    actor.role !== "ADMIN"
  ) {
    throw errors.forbidden();
  }

  const rows = await prisma.fieldActivity.findMany({
    where: { tcUserId: actor.id },
    orderBy: { date: "desc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    serviceLine: row.serviceLine,
    activityType: row.activityType,
    peopleReached: row.peopleReached,
    summary: row.summary,
    outcome: row.outcome,
    district: row.geoDistrict,
  }));
}

export async function coaPerformanceReport(opts: {
  dateFrom: string;
  dateTo: string;
}) {
  const from = new Date(`${opts.dateFrom}T00:00:00.000Z`);
  const to = new Date(`${opts.dateTo}T23:59:59.999Z`);

  const coas = await prisma.user.findMany({
    where: { role: "COMMUNITY_OPPORTUNITY_ASSOCIATE", status: "active" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const activities = await prisma.fieldActivity.findMany({
    where: {
      tcUserId: { in: coas.map((c) => c.id) },
      date: { gte: from, lte: to },
    },
  });

  const byCoa = coas.map((coa) => {
    const mine = activities.filter((a) => a.tcUserId === coa.id);
    const byKind: Record<string, number> = {};
    let peopleReached = 0;
    for (const a of mine) {
      peopleReached += a.peopleReached;
      const kindMatch = /^\[([^\]]+)\]/.exec(a.summary);
      const kind = kindMatch?.[1] ?? a.activityType;
      byKind[kind] = (byKind[kind] ?? 0) + a.peopleReached;
    }
    return {
      coaId: coa.id,
      name: coa.name,
      email: coa.email,
      activitiesCount: mine.length,
      peopleReached,
      byKind,
    };
  });

  const totals = {
    activitiesCount: byCoa.reduce((s, r) => s + r.activitiesCount, 0),
    peopleReached: byCoa.reduce((s, r) => s + r.peopleReached, 0),
  };

  return { dateFrom: opts.dateFrom, dateTo: opts.dateTo, rows: byCoa, totals };
}
