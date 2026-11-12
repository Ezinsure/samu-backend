import type { CoaEvidenceType } from "@prisma/client";

/** Canonical imihigo catalog seeded for COA performance. */
export type CoaMetricSeed = {
  key: string;
  label: string;
  description: string;
  adminNote?: string;
  monthlyTarget: number;
  evidenceType: CoaEvidenceType;
  enabled: boolean;
  sortOrder: number;
};

export const COA_METRIC_CATALOG: CoaMetricSeed[] = [
  {
    key: "bk_accounts",
    label: "Bank of Kigali accounts opened",
    description: "BK account list actives — clients with new BK accounts.",
    monthlyTarget: 50,
    evidenceType: "client_rows",
    enabled: true,
    sortOrder: 10,
  },
  {
    key: "irembo_agents_applied",
    label: "New people applied to become Irembo Agents",
    description:
      "Counted automatically from agent candidates the COA created or who joined via their invite link.",
    monthlyTarget: 10,
    evidenceType: "auto_irembo",
    enabled: true,
    sortOrder: 20,
  },
  {
    key: "ezinsure_policies",
    label: "Insurance policies placed (Ezinsure)",
    description: "Proof of payment or insurance certificate issued to the client.",
    monthlyTarget: 15,
    evidenceType: "file_upload",
    enabled: true,
    sortOrder: 30,
  },
  {
    key: "ezinsure_agents_applied",
    label: "New people applied to become Insurance Agents (Ezinsure)",
    description: "New agents registered on Ezinsure up to the cell level.",
    monthlyTarget: 10,
    evidenceType: "client_rows",
    enabled: true,
    sortOrder: 40,
  },
  {
    key: "internet_subscriptions",
    label: "Internet subscriptions activated",
    description:
      "Partner activation — choose Mobile SIM, Home Broadband (HBB), or Office Broadband (OBB).",
    monthlyTarget: 15,
    evidenceType: "client_rows",
    enabled: true,
    sortOrder: 50,
  },
  {
    key: "internet_agents_applied",
    label: "New people applied to become Internet Agents",
    description:
      "Internet agent applicants (separate from Irembo agent candidates).",
    monthlyTarget: 5,
    evidenceType: "client_rows",
    enabled: true,
    sortOrder: 60,
  },
  {
    key: "smartphone_installments",
    label: "Smartphones sold on instalment",
    description: "Signed instalment agreements.",
    monthlyTarget: 8,
    evidenceType: "file_upload",
    enabled: true,
    sortOrder: 70,
  },
  {
    key: "induction_cooker_installments",
    label: "Induction cookers sold on instalment",
    description: "Signed instalment agreements.",
    monthlyTarget: 5,
    evidenceType: "file_upload",
    enabled: false,
    sortOrder: 80,
  },
  {
    key: "solar_home_systems",
    label: "Solar home systems",
    description: "Signed instalment agreements for solar home systems.",
    adminNote: "Prioritize vulnerable women doing small and medium business.",
    monthlyTarget: 30,
    evidenceType: "file_upload",
    enabled: false,
    sortOrder: 90,
  },
  {
    key: "solar_water_heaters",
    label: "Solar water heaters",
    description: "Signed instalment agreements for solar water heaters.",
    monthlyTarget: 5,
    evidenceType: "file_upload",
    enabled: true,
    sortOrder: 100,
  },
];
