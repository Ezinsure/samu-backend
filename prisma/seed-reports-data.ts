/**
 * Demo monthly reports + scorecards — mirrors frontend/data/operations.ts.
 */

export type SeedReport = {
  id: string;
  tcEmail: string;
  period: string;
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "changes_requested"
    | "resubmitted"
    | "reviewed"
    | "evaluated";
  deadline: string;
  submittedAt?: string;
  territorySnapshot: string[];
  kpiActuals: Record<string, number>;
  narrative: Record<string, string>;
  reviewNotes?: string;
  history: Array<{
    id: string;
    at: string;
    byEmail: string;
    action: "save_draft" | "submit" | "request_changes" | "resubmit" | "review";
    status: string;
    notes?: string;
  }>;
};

export type SeedScorecard = {
  id: string;
  monthlyReportId: string;
  tcEmail: string;
  period: string;
  status: "draft" | "submitted";
  templateVersion: string;
  criteria: Array<{ criterionId: string; score: number; comment: string }>;
  overallComment: string;
  decision?:
    | "Outstanding"
    | "Meets expectations"
    | "Needs improvement"
    | "Unsatisfactory";
  weightedTotal: number;
  evaluatorEmail?: string;
  submittedAt?: string;
  updatedAt: string;
};

export const SEED_REPORTS: SeedReport[] = [
  {
    id: "report-2026-09-tc-kigali",
    tcEmail: "tc.kigali@solektra.rw",
    period: "2026-09",
    status: "draft",
    deadline: "2026-10-05",
    territorySnapshot: ["Gasabo", "Kicukiro", "Nyarugenge"],
    kpiActuals: {
      totalVisits: 14,
      uniqueAgentsVisited: 12,
      sensitizationEvents: 2,
      peopleReached: 205,
      trainingSessions: 1,
      agentsTrained: 8,
      meetings: 2,
      newAgents: 1,
      reactivatedAgents: 0,
      newClients: 22,
    },
    narrative: {
      g1: "Completed targeted Ezinsure coaching in Remera and improved branding visibility for three agents.",
      g2: "Internet outages in Kanombe delayed two planned visits.",
      g3: "Most Gasabo agents are green; Kicukiro still has overdue coverage gaps.",
      g4: "Sector leaders approved two market sensitization slots in Kicukiro.",
      g5: "Need router replacement for Chantal Ingabire and insurance toolkit restock.",
      g6: "GPS mismatch risk remains on Problem Solving visits far from registered points.",
      g7: "Clear Kanombe overdue list and complete second training cohort.",
    },
    history: [
      {
        id: "rh-001",
        at: "2026-09-15T09:00:00.000Z",
        byEmail: "tc.kigali@solektra.rw",
        action: "save_draft",
        status: "draft",
        notes: "Initial KPI draft saved.",
      },
    ],
  },
  {
    id: "report-2026-09-tc-south",
    tcEmail: "tc.south@solektra.rw",
    period: "2026-09",
    status: "submitted",
    deadline: "2026-10-05",
    submittedAt: "2026-09-18T08:00:00.000Z",
    territorySnapshot: ["Huye", "Muhanga"],
    kpiActuals: {
      totalVisits: 9,
      uniqueAgentsVisited: 8,
      sensitizationEvents: 1,
      peopleReached: 70,
      trainingSessions: 1,
      agentsTrained: 6,
      meetings: 1,
      newAgents: 1,
      reactivatedAgents: 1,
      newClients: 15,
    },
    narrative: {
      g1: "Reactivated one inactive agent and completed Ngoma sensitization with local chiefs.",
      g2: "Claims delays affected agent confidence in Huye.",
      g3: "Huye coverage is stronger than Muhanga this month.",
      g4: "Maintained weekly check-ins with sector office.",
      g5: "Escalate claims SLA response from Head Office.",
      g6: "Training attendance strong but printer gaps remain.",
      g7: "Push Muhanga overdue visits and second training session.",
    },
    history: [
      {
        id: "rh-002",
        at: "2026-09-18T08:00:00.000Z",
        byEmail: "tc.south@solektra.rw",
        action: "submit",
        status: "submitted",
        notes: "Submitted for Head Office review.",
      },
    ],
  },
  {
    id: "report-2026-08-tc-kigali",
    tcEmail: "tc.kigali@solektra.rw",
    period: "2026-08",
    status: "evaluated",
    deadline: "2026-09-05",
    submittedAt: "2026-09-03T16:20:00.000Z",
    territorySnapshot: ["Gasabo", "Kicukiro", "Nyarugenge"],
    kpiActuals: {
      totalVisits: 22,
      uniqueAgentsVisited: 19,
      sensitizationEvents: 3,
      peopleReached: 260,
      trainingSessions: 2,
      agentsTrained: 18,
      meetings: 3,
      newAgents: 2,
      reactivatedAgents: 1,
      newClients: 34,
    },
    narrative: {
      g1: "Exceeded visit and training targets for August.",
      g2: "Seasonal rains slowed market campaigns mid-month.",
      g3: "Compliance improved across Gasabo after focused coaching.",
      g4: "Partner meeting unlocked two new sensitization venues.",
      g5: "None outstanding after toolkit delivery.",
      g6: "SMS disputes were rare and resolved quickly.",
      g7: "Maintain cadence and onboard September recruits.",
    },
    reviewNotes: "Strong month. Proceeded to scorecard evaluation.",
    history: [
      {
        id: "rh-003",
        at: "2026-09-03T16:20:00.000Z",
        byEmail: "tc.kigali@solektra.rw",
        action: "submit",
        status: "submitted",
      },
      {
        id: "rh-004",
        at: "2026-09-06T10:00:00.000Z",
        byEmail: "ops@solektra.rw",
        action: "review",
        status: "evaluated",
        notes: "Accepted for scorecard.",
      },
    ],
  },
];

export const SEED_SCORECARDS: SeedScorecard[] = [
  {
    id: "score-2026-08-tc-kigali",
    monthlyReportId: "report-2026-08-tc-kigali",
    tcEmail: "tc.kigali@solektra.rw",
    period: "2026-08",
    status: "submitted",
    templateVersion: "v1-2026",
    criteria: [
      { criterionId: "field_visits", score: 5, comment: "Exceeded visit target." },
      { criterionId: "sensitization", score: 4, comment: "Strong community reach." },
      { criterionId: "agent_training", score: 5, comment: "Two sessions, full attendance." },
      { criterionId: "agent_mapping", score: 4, comment: "Mapping complete and current." },
      { criterionId: "meetings", score: 4, comment: "Regular partner and agent meetings." },
      {
        criterionId: "recruitment_reactivation",
        score: 4,
        comment: "Two recruits and one reactivation.",
      },
      { criterionId: "narrative_quality", score: 5, comment: "Clear and actionable narrative." },
      {
        criterionId: "reporting_timeliness",
        score: 5,
        comment: "Submitted before the 5th.",
      },
    ],
    overallComment:
      "Excellent August performance. Maintain cadence into September.",
    decision: "Outstanding",
    weightedTotal: 4.55,
    evaluatorEmail: "ops@solektra.rw",
    submittedAt: "2026-09-06T11:00:00.000Z",
    updatedAt: "2026-09-06T11:00:00.000Z",
  },
  {
    id: "score-2026-09-tc-south",
    monthlyReportId: "report-2026-09-tc-south",
    tcEmail: "tc.south@solektra.rw",
    period: "2026-09",
    status: "draft",
    templateVersion: "v1-2026",
    criteria: [
      { criterionId: "field_visits", score: 3, comment: "" },
      { criterionId: "sensitization", score: 3, comment: "" },
      { criterionId: "agent_training", score: 3, comment: "" },
      { criterionId: "agent_mapping", score: 3, comment: "" },
      { criterionId: "meetings", score: 3, comment: "" },
      { criterionId: "recruitment_reactivation", score: 4, comment: "" },
      { criterionId: "narrative_quality", score: 3, comment: "" },
      { criterionId: "reporting_timeliness", score: 4, comment: "" },
    ],
    overallComment: "",
    weightedTotal: 3.25,
    evaluatorEmail: "ops@solektra.rw",
    updatedAt: "2026-09-19T09:00:00.000Z",
  },
];
