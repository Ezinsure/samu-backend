/**
 * Demo field visits — mirrors frontend/data/operations.ts VISITS (+ GPS fraud on visit-002).
 * tcEmail resolves to seed users; agent ids match seed agents.
 */

export type SeedVisitPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type SeedVisit = {
  id: string;
  agentId: string;
  tcEmail: string;
  purpose: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  activities: string;
  outcome: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  distanceFromRegisteredMeters: number;
  validation: "accepted" | "flagged" | "rejected";
  confirmationStatus:
    | "pending"
    | "confirmed"
    | "disputed"
    | "expired"
    | "delivery_failed";
  challenges?: string;
  supportNeeded?: string;
  flaggedReason?: string;
  photos: SeedVisitPhoto[];
};

export type SeedFraudFlag = {
  id: string;
  visitId: string;
  type: string;
  severity: "low" | "medium" | "high";
  status: "open" | "escalated" | "resolved" | "dismissed";
  detectedAt: string;
  notes?: string;
  resolution?: string;
};

export const SEED_VISITS: SeedVisit[] = [
  {
    id: "visit-001",
    agentId: "agent-001",
    tcEmail: "tc.kigali@solektra.rw",
    purpose: "Ezinsure Support",
    startedAt: "2026-09-10T09:20:00.000Z",
    endedAt: "2026-09-10T09:55:00.000Z",
    durationMinutes: 35,
    activities: "Walked agent through Ezinsure registration and claims form.",
    outcome: "Agent completed 3 client registrations independently.",
    lat: -1.9537,
    lng: 30.1208,
    accuracyMeters: 8,
    distanceFromRegisteredMeters: 12,
    validation: "accepted",
    confirmationStatus: "confirmed",
    photos: [
      {
        id: "vphoto-001-a",
        fileName: "visit-001-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 120_000,
      },
      {
        id: "vphoto-001-b",
        fileName: "visit-001-b.jpg",
        contentType: "image/jpeg",
        sizeBytes: 98_000,
      },
    ],
  },
  {
    id: "visit-002",
    agentId: "agent-003",
    tcEmail: "tc.kigali@solektra.rw",
    purpose: "Problem Solving",
    startedAt: "2026-09-09T14:00:00.000Z",
    endedAt: "2026-09-09T14:40:00.000Z",
    durationMinutes: 40,
    activities: "Diagnosed missing insurance tools and connectivity issues.",
    outcome: "Escalated internet restore request to Head Office.",
    lat: -1.9815,
    lng: 30.1701,
    accuracyMeters: 18,
    distanceFromRegisteredMeters: 180,
    validation: "flagged",
    confirmationStatus: "disputed",
    flaggedReason: "GPS distance above threshold",
    challenges: "No stable internet at point of sale.",
    supportNeeded: "Router replacement and insurance toolkit.",
    photos: [
      {
        id: "vphoto-002-a",
        fileName: "visit-002-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 110_000,
      },
    ],
  },
  {
    id: "visit-003",
    agentId: "agent-005",
    tcEmail: "tc.kigali@solektra.rw",
    purpose: "Performance Review",
    startedAt: "2026-09-12T10:15:00.000Z",
    endedAt: "2026-09-12T10:50:00.000Z",
    durationMinutes: 35,
    activities: "Reviewed monthly sales targets and branding visibility.",
    outcome: "Agent committed to daily outreach plan.",
    lat: -1.9709,
    lng: 30.0446,
    accuracyMeters: 6,
    distanceFromRegisteredMeters: 8,
    validation: "accepted",
    confirmationStatus: "pending",
    photos: [
      {
        id: "vphoto-003-a",
        fileName: "visit-003-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 105_000,
      },
      {
        id: "vphoto-003-b",
        fileName: "visit-003-b.jpg",
        contentType: "image/jpeg",
        sizeBytes: 88_000,
      },
    ],
  },
  {
    id: "visit-004",
    agentId: "agent-021",
    tcEmail: "tc.south@solektra.rw",
    purpose: "Ezinsure Support",
    startedAt: "2026-09-06T10:00:00.000Z",
    endedAt: "2026-09-06T10:45:00.000Z",
    durationMinutes: 45,
    activities: "One-on-one Ezinsure refresher for new product codes.",
    outcome: "Agent can register clients without assistance.",
    lat: -2.5968,
    lng: 29.7395,
    accuracyMeters: 7,
    distanceFromRegisteredMeters: 9,
    validation: "accepted",
    confirmationStatus: "confirmed",
    photos: [
      {
        id: "vphoto-004-a",
        fileName: "visit-004-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 95_000,
      },
    ],
  },
  {
    id: "visit-005",
    agentId: "agent-023",
    tcEmail: "tc.south@solektra.rw",
    purpose: "Performance Review",
    startedAt: "2026-09-11T14:00:00.000Z",
    endedAt: "2026-09-11T14:30:00.000Z",
    durationMinutes: 30,
    activities: "Reviewed reactivation pipeline for inactive agents nearby.",
    outcome: "Two reactivation visits scheduled next week.",
    lat: -2.0856,
    lng: 29.7529,
    accuracyMeters: 10,
    distanceFromRegisteredMeters: 11,
    validation: "accepted",
    confirmationStatus: "confirmed",
    photos: [
      {
        id: "vphoto-005-a",
        fileName: "visit-005-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 102_000,
      },
      {
        id: "vphoto-005-b",
        fileName: "visit-005-b.jpg",
        contentType: "image/jpeg",
        sizeBytes: 91_000,
      },
    ],
  },
  {
    id: "visit-006",
    agentId: "agent-012",
    tcEmail: "tc.kigali@solektra.rw",
    purpose: "Ezinsure Support",
    startedAt: "2026-09-03T08:10:00.000Z",
    endedAt: "2026-09-03T08:55:00.000Z",
    durationMinutes: 45,
    activities: "BK tools onboarding and printer connectivity check.",
    outcome: "Agent ready for Bank of Kigali assisted flows.",
    lat: -1.9422,
    lng: 30.1339,
    accuracyMeters: 5,
    distanceFromRegisteredMeters: 7,
    validation: "accepted",
    confirmationStatus: "confirmed",
    photos: [
      {
        id: "vphoto-006-a",
        fileName: "visit-006-a.jpg",
        contentType: "image/jpeg",
        sizeBytes: 115_000,
      },
      {
        id: "vphoto-006-b",
        fileName: "visit-006-b.jpg",
        contentType: "image/jpeg",
        sizeBytes: 99_000,
      },
      {
        id: "vphoto-006-c",
        fileName: "visit-006-c.jpg",
        contentType: "image/jpeg",
        sizeBytes: 87_000,
      },
    ],
  },
];

export type SeedFraudReviewEvent = {
  id: string;
  at: string;
  byEmail: string;
  action: "accept" | "escalate" | "dismiss" | "note";
  notes?: string;
};

export type SeedFraudFlagFull = SeedFraudFlag & {
  assignedReviewerEmail?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  resolution?: string;
  reviewHistory?: SeedFraudReviewEvent[];
};

/** Mirrors frontend/data/operations.ts FRAUD_FLAGS. */
export const SEED_FRAUD_FLAGS: SeedFraudFlagFull[] = [
  {
    id: "fraud-001",
    visitId: "visit-002",
    type: "GPS mismatch",
    severity: "high",
    status: "open",
    detectedAt: "2026-09-09T14:41:00.000Z",
    notes: "Visit captured 180m from registered agent location.",
    reviewHistory: [],
  },
  {
    id: "fraud-002",
    visitId: "visit-001",
    type: "Unusual visit frequency",
    severity: "medium",
    status: "escalated",
    detectedAt: "2026-09-10T10:05:00.000Z",
    notes: "Third visit to the same agent within 48 hours.",
    assignedReviewerEmail: "ops@solektra.rw",
    reviewHistory: [
      {
        id: "freview-001",
        at: "2026-09-10T11:00:00.000Z",
        byEmail: "ops@solektra.rw",
        action: "escalate",
        notes: "Pattern needs Head Office confirmation.",
      },
    ],
  },
  {
    id: "fraud-003",
    visitId: "visit-006",
    type: "Missing evidence metadata",
    severity: "low",
    status: "resolved",
    detectedAt: "2026-09-03T09:00:00.000Z",
    notes: "Photo EXIF incomplete; reviewed and accepted.",
    resolution: "Evidence confirmed via TC follow-up call.",
    reviewedAt: "2026-09-04T08:30:00.000Z",
    reviewedByEmail: "admin@solektra.rw",
    reviewHistory: [
      {
        id: "freview-002",
        at: "2026-09-04T08:30:00.000Z",
        byEmail: "admin@solektra.rw",
        action: "accept",
        notes: "Evidence confirmed via TC follow-up call.",
      },
    ],
  },
  {
    id: "fraud-004",
    visitId: "visit-003",
    type: "SMS dispute correlation",
    severity: "medium",
    status: "open",
    detectedAt: "2026-09-12T12:00:00.000Z",
    notes: "Agent SMS still pending while GPS borderline accepted.",
    reviewHistory: [],
  },
];
