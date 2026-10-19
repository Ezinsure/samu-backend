import type { FieldActivityType, ServiceLine } from "@prisma/client";

export type SeedActivityRow = {
  id: string;
  tcEmail: string;
  serviceLine: ServiceLine;
  activityType: FieldActivityType;
  date: string;
  province: string;
  district: string;
  sector: string;
  venue: string;
  peopleReached: number;
  summary: string;
  outcome: string;
  leadId?: string;
  agentId?: string;
  createdAt: string;
};

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/** Mirrors frontend/data/coap.ts FIELD_ACTIVITIES with TC emails. */
export const SEED_ACTIVITIES: SeedActivityRow[] = [
  {
    id: "fact-001",
    tcEmail: TC_KIGALI,
    serviceLine: "irembo",
    activityType: "education",
    date: "2026-09-08",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Remera",
    venue: "Remera sector hall",
    peopleReached: 42,
    summary: "Explained IREMBO services and agent opportunities",
    outcome: "8 people requested follow-up for agent applications",
    leadId: "lead-001",
    createdAt: "2026-09-08T17:00:00.000Z",
  },
  {
    id: "fact-002",
    tcEmail: TC_KIGALI,
    serviceLine: "bk",
    activityType: "education",
    date: "2026-09-10",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Kanombe",
    venue: "Kanombe market meeting point",
    peopleReached: 28,
    summary: "Financial literacy and eKash demonstration",
    outcome: "12 participants want savings account support",
    createdAt: "2026-09-10T16:30:00.000Z",
  },
  {
    id: "fact-003",
    tcEmail: TC_KIGALI,
    serviceLine: "internet",
    activityType: "campaign",
    date: "2026-09-11",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    venue: "Nyamirambo business strip",
    peopleReached: 35,
    summary: "4G Home/Business awareness walk",
    outcome: "5 business leads captured",
    leadId: "lead-002",
    createdAt: "2026-09-11T18:00:00.000Z",
  },
  {
    id: "fact-004",
    tcEmail: TC_KIGALI,
    serviceLine: "clean_cooking",
    activityType: "demo",
    date: "2026-09-05",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Gikondo",
    venue: "Gikondo household cluster",
    peopleReached: 18,
    summary: "Induction cooker demonstration",
    outcome: "3 households ready to purchase",
    leadId: "lead-005",
    createdAt: "2026-09-05T15:00:00.000Z",
  },
  {
    id: "fact-005",
    tcEmail: TC_SOUTH,
    serviceLine: "insurance",
    activityType: "mobilization",
    date: "2026-09-09",
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    venue: "Ngoma cell office",
    peopleReached: 50,
    summary: "Insurance benefits awareness for families",
    outcome: "Follow-up list of 15 potential customers",
    leadId: "lead-006",
    createdAt: "2026-09-09T16:00:00.000Z",
  },
  {
    id: "fact-006",
    tcEmail: TC_SOUTH,
    serviceLine: "device_financing",
    activityType: "support",
    date: "2026-09-12",
    province: "Southern Province",
    district: "Muhanga",
    sector: "Nyamabuye",
    venue: "Muhanga town center",
    peopleReached: 10,
    summary: "Explained installment plans one-on-one",
    outcome: "2 customers scheduled for registration",
    createdAt: "2026-09-12T14:00:00.000Z",
  },
];
