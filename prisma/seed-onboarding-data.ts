import type { OnboardingKind, OnboardingStatus, ServiceLine } from "@prisma/client";

export type SeedOnboardingRow = {
  id: string;
  tcEmail: string;
  serviceLine: ServiceLine;
  kind: OnboardingKind;
  status: OnboardingStatus;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  agentId?: string;
  province: string;
  district: string;
  sector: string;
  stageLabel: string;
  notes?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
};

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/** Mirrors frontend/data/coap.ts ONBOARDING_CASES with TC emails. */
export const SEED_ONBOARDING: SeedOnboardingRow[] = [
  {
    id: "ob-001",
    tcEmail: TC_KIGALI,
    serviceLine: "irembo",
    kind: "irembo_agent",
    status: "in_progress",
    customerName: "Josephine Uwimana",
    customerPhone: "+250788100101",
    leadId: "lead-001",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Remera",
    stageLabel: "Documents submitted",
    notes: "Awaiting IREMBO partner confirmation",
    startedAt: "2026-09-12T09:00:00.000Z",
    updatedAt: "2026-09-16T10:00:00.000Z",
  },
  {
    id: "ob-002",
    tcEmail: TC_KIGALI,
    serviceLine: "bk",
    kind: "bk_account",
    status: "not_started",
    customerName: "Samuel Habimana",
    customerPhone: "+250788100103",
    leadId: "lead-003",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Kanombe",
    stageLabel: "First contact scheduled",
    startedAt: "2026-09-14T09:00:00.000Z",
    updatedAt: "2026-09-14T09:00:00.000Z",
  },
  {
    id: "ob-003",
    tcEmail: TC_KIGALI,
    serviceLine: "internet",
    kind: "internet_activation",
    status: "pending_partner",
    customerName: "Kigali Tailors Co-op",
    customerPhone: "+250788100102",
    leadId: "lead-002",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    stageLabel: "Installation queued",
    startedAt: "2026-09-11T11:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  },
  {
    id: "ob-004",
    tcEmail: TC_KIGALI,
    serviceLine: "device_financing",
    kind: "device_registration",
    status: "in_progress",
    customerName: "Grace Mukamana",
    customerPhone: "+250788100104",
    leadId: "lead-004",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Kimironko",
    stageLabel: "Deposit collected",
    startedAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-13T10:00:00.000Z",
  },
  {
    id: "ob-005",
    tcEmail: TC_KIGALI,
    serviceLine: "clean_cooking",
    kind: "cooker_purchase",
    status: "completed",
    customerName: "Pauline Iradukunda",
    customerPhone: "+250788100105",
    leadId: "lead-005",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Gikondo",
    stageLabel: "Delivered",
    startedAt: "2026-09-06T10:00:00.000Z",
    updatedAt: "2026-09-07T14:00:00.000Z",
    completedAt: "2026-09-07T14:00:00.000Z",
  },
  {
    id: "ob-006",
    tcEmail: TC_SOUTH,
    serviceLine: "insurance",
    kind: "customer",
    status: "in_progress",
    customerName: "Jean Bosco Ndayisaba",
    customerPhone: "+250788100106",
    leadId: "lead-006",
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    stageLabel: "Product selection",
    startedAt: "2026-09-11T09:00:00.000Z",
    updatedAt: "2026-09-14T09:00:00.000Z",
  },
];
