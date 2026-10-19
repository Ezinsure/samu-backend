import type { LeadEntityType, LeadStatus, ServiceLine } from "@prisma/client";

export type SeedLeadRow = {
  id: string;
  name: string;
  phone: string;
  entityType: LeadEntityType;
  serviceLine: ServiceLine;
  status: LeadStatus;
  province: string;
  district: string;
  sector: string;
  tcEmail: string;
  interestSummary?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  convertedAt?: string;
};

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/** Mirrors frontend/data/coap.ts LEADS with TC emails. */
export const SEED_LEADS: SeedLeadRow[] = [
  {
    id: "lead-001",
    name: "Josephine Uwimana",
    phone: "+250788100101",
    entityType: "person",
    serviceLine: "irembo",
    status: "qualified",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Remera",
    tcEmail: TC_KIGALI,
    interestSummary: "Wants to open an IREMBO agent account",
    notes: "Attended sector sensitization last week",
    createdAt: "2026-09-02T09:00:00.000Z",
    updatedAt: "2026-09-12T14:00:00.000Z",
  },
  {
    id: "lead-002",
    name: "Kigali Tailors Co-op",
    phone: "+250788100102",
    entityType: "business",
    serviceLine: "internet",
    status: "contacted",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    tcEmail: TC_KIGALI,
    interestSummary: "4G business internet for shop",
    createdAt: "2026-09-05T10:00:00.000Z",
    updatedAt: "2026-09-10T11:00:00.000Z",
  },
  {
    id: "lead-003",
    name: "Samuel Habimana",
    phone: "+250788100103",
    entityType: "household",
    serviceLine: "bk",
    status: "new",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Kanombe",
    tcEmail: TC_KIGALI,
    interestSummary: "Interested in eKash and savings account",
    createdAt: "2026-09-14T08:30:00.000Z",
    updatedAt: "2026-09-14T08:30:00.000Z",
  },
  {
    id: "lead-004",
    name: "Grace Mukamana",
    phone: "+250788100104",
    entityType: "person",
    serviceLine: "device_financing",
    status: "qualified",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Kimironko",
    tcEmail: TC_KIGALI,
    interestSummary: "Smartphone installment plan",
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-08T16:00:00.000Z",
  },
  {
    id: "lead-005",
    name: "Pauline Iradukunda",
    phone: "+250788100105",
    entityType: "household",
    serviceLine: "clean_cooking",
    status: "converted",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Gikondo",
    tcEmail: TC_KIGALI,
    interestSummary: "Induction cooker after demo",
    createdAt: "2026-08-20T09:00:00.000Z",
    updatedAt: "2026-09-06T15:00:00.000Z",
    convertedAt: "2026-09-06T15:00:00.000Z",
  },
  {
    id: "lead-006",
    name: "Jean Bosco Ndayisaba",
    phone: "+250788100106",
    entityType: "person",
    serviceLine: "insurance",
    status: "contacted",
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    tcEmail: TC_SOUTH,
    interestSummary: "Family insurance education follow-up",
    createdAt: "2026-09-03T10:00:00.000Z",
    updatedAt: "2026-09-11T09:00:00.000Z",
  },
  {
    id: "lead-007",
    name: "Mukamira Trading",
    phone: "+250788100107",
    entityType: "business",
    serviceLine: "internet",
    status: "new",
    province: "Southern Province",
    district: "Muhanga",
    sector: "Nyamabuye",
    tcEmail: TC_SOUTH,
    interestSummary: "Starlink for rural shop connectivity",
    createdAt: "2026-09-15T07:00:00.000Z",
    updatedAt: "2026-09-15T07:00:00.000Z",
  },
  {
    id: "lead-008",
    name: "Aline Uwase",
    phone: "+250788100108",
    entityType: "person",
    serviceLine: "irembo",
    status: "lost",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Remera",
    tcEmail: TC_KIGALI,
    interestSummary: "Could not complete NID verification",
    notes: "Asked to revisit next month",
    createdAt: "2026-08-10T11:00:00.000Z",
    updatedAt: "2026-08-28T11:00:00.000Z",
  },
];
