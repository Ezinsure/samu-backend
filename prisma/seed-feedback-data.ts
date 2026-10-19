import type {
  FeedbackKind,
  FeedbackSeverity,
  FeedbackStatus,
  ServiceLine,
} from "@prisma/client";

export type SeedFeedbackRow = {
  id: string;
  tcEmail: string;
  serviceLine?: ServiceLine;
  kind: FeedbackKind;
  severity: FeedbackSeverity;
  status: FeedbackStatus;
  title: string;
  description: string;
  province: string;
  district: string;
  sector: string;
  leadId?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
};

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/** Mirrors frontend/data/coap.ts COMMUNITY_FEEDBACK with TC emails. */
export const SEED_FEEDBACK: SeedFeedbackRow[] = [
  {
    id: "fb-001",
    tcEmail: TC_KIGALI,
    serviceLine: "internet",
    kind: "challenge",
    severity: "medium",
    status: "open",
    title: "Weak indoor signal in older buildings",
    description:
      "Several Nyamirambo shops report weak indoor 4G reception after signup interest.",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    leadId: "lead-002",
    createdAt: "2026-09-13T10:00:00.000Z",
    updatedAt: "2026-09-13T10:00:00.000Z",
  },
  {
    id: "fb-002",
    tcEmail: TC_KIGALI,
    serviceLine: "bk",
    kind: "need",
    severity: "high",
    status: "acknowledged",
    title: "More eKash demos in local language",
    description: "Community asked for Kinyarwanda-first demos at market days.",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Kanombe",
    createdAt: "2026-09-10T18:00:00.000Z",
    updatedAt: "2026-09-12T09:00:00.000Z",
  },
  {
    id: "fb-003",
    tcEmail: TC_SOUTH,
    serviceLine: "clean_cooking",
    kind: "opportunity",
    severity: "medium",
    status: "open",
    title: "Cooperative bulk purchase interest",
    description: "Women's cooperative wants a group demo and bulk pricing.",
    province: "Southern Province",
    district: "Muhanga",
    sector: "Nyamabuye",
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-14T12:00:00.000Z",
  },
  {
    id: "fb-004",
    tcEmail: TC_SOUTH,
    kind: "challenge",
    severity: "low",
    status: "resolved",
    title: "Transport to distant cells",
    description: "Resolved by scheduling shared TC travel days twice weekly.",
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    resolutionNotes: "Shared travel calendar agreed with Ops",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-09-01T10:00:00.000Z",
  },
];
