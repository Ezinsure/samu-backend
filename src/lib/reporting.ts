import type { ScorecardDecision } from "@prisma/client";

/** Default KPI targets (also used to seed SystemSettings). */
export const DEFAULT_KPI_TARGETS: Record<string, number> = {
  totalVisits: 20,
  uniqueAgentsVisited: 18,
  sensitizationEvents: 2,
  peopleReached: 100,
  trainingSessions: 2,
  agentsTrained: 18,
  meetings: 2,
  newAgents: 1,
  reactivatedAgents: 1,
  newClients: 30,
  coapLeads: 5,
  coapActivities: 4,
  coapOnboardingCompleted: 2,
  coapSales: 2,
  coapFeedbackOpen: 0,
};

export const EMPTY_NARRATIVE = {
  g1: "",
  g2: "",
  g3: "",
  g4: "",
  g5: "",
  g6: "",
  g7: "",
};

export const NARRATIVE_KEYS = ["g1", "g2", "g3", "g4", "g5", "g6", "g7"] as const;

export type NarrativeKey = (typeof NARRATIVE_KEYS)[number];

export type ReportNarrative = Record<NarrativeKey, string>;

export const SCORECARD_CRITERIA = [
  { id: "field_visits", label: "Field visits", weight: 0.2 },
  { id: "sensitization", label: "Sensitization", weight: 0.15 },
  { id: "agent_training", label: "Agent training", weight: 0.15 },
  { id: "agent_mapping", label: "Agent mapping", weight: 0.1 },
  { id: "meetings", label: "Meetings", weight: 0.1 },
  {
    id: "recruitment_reactivation",
    label: "Recruitment and reactivation",
    weight: 0.1,
  },
  { id: "narrative_quality", label: "Narrative quality", weight: 0.1 },
  {
    id: "reporting_timeliness",
    label: "Reporting timeliness and completeness",
    weight: 0.1,
  },
] as const;

export type CriterionScore = {
  criterionId: string;
  score: number;
  comment: string;
};

/** Day-of-month deadline for monthly reports (next calendar month). */
export const MONTHLY_REPORT_DUE_DAY = 5;

export function periodDeadline(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  // Deadline is the 5th of the following month (UTC date).
  return new Date(Date.UTC(y, m, MONTHLY_REPORT_DUE_DAY));
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function daysUntilDeadline(deadline: Date): number {
  const end = new Date(
    `${formatDateOnly(deadline)}T23:59:59.000Z`,
  ).getTime();
  return Math.ceil((end - Date.now()) / 86_400_000);
}

export function calculateWeightedTotal(criteria: CriterionScore[]): number {
  const total = SCORECARD_CRITERIA.reduce((sum, def) => {
    const score =
      criteria.find((item) => item.criterionId === def.id)?.score ?? 0;
    return sum + score * def.weight;
  }, 0);
  return Math.round(total * 100) / 100;
}

export function suggestDecision(weightedTotal: number): ScorecardDecision {
  if (weightedTotal >= 4.5) return "Outstanding";
  if (weightedTotal >= 3.5) return "MeetsExpectations";
  if (weightedTotal >= 2.5) return "NeedsImprovement";
  return "Unsatisfactory";
}

/** API-facing decision labels (match frontend). */
export function decisionToApi(
  decision: ScorecardDecision | null | undefined,
): string | undefined {
  if (!decision) return undefined;
  if (decision === "MeetsExpectations") return "Meets expectations";
  if (decision === "NeedsImprovement") return "Needs improvement";
  return decision;
}

export function decisionFromApi(
  value: string,
): ScorecardDecision | undefined {
  if (value === "Outstanding") return "Outstanding";
  if (value === "Meets expectations") return "MeetsExpectations";
  if (value === "Needs improvement") return "NeedsImprovement";
  if (value === "Unsatisfactory") return "Unsatisfactory";
  return undefined;
}

export function kpiProgressPercent(
  actuals: Record<string, number>,
  targets: Record<string, number> = DEFAULT_KPI_TARGETS,
): number {
  const keys = Object.keys(targets);
  const met = keys.filter(
    (key) => (actuals[key] ?? 0) >= (targets[key] ?? 0),
  ).length;
  return Math.round((met / Math.max(keys.length, 1)) * 100);
}
