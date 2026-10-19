import type { ServiceLine } from "@prisma/client";
import { z } from "zod";

/**
 * Canonical service-line catalogue (mirrors frontend `lib/coap/catalog.ts`).
 * Kept server-side so aggregate endpoints can return labels without a second round trip.
 */
export type ServiceLineMeta = {
  id: ServiceLine;
  label: string;
  shortLabel: string;
  description: string;
  tasks: string[];
};

export const SERVICE_LINES: ServiceLineMeta[] = [
  {
    id: "irembo",
    label: "IREMBO Government Services",
    shortLabel: "IREMBO",
    description:
      "Educate communities, help with IREMBO accounts, and mobilize IREMBO service agents.",
    tasks: [
      "Educate people about IREMBO government services",
      "Assist with IREMBO account creation and management",
      "Guide digital service requests",
      "Mobilize and support IREMBO agent applications",
    ],
  },
  {
    id: "bk",
    label: "Bank of Kigali & Financial Inclusion",
    shortLabel: "BK / Savings",
    description:
      "Promote saving, eKash, and access to formal banking — facilitate, do not only sell.",
    tasks: [
      "Educate on saving and digital financial tools",
      "Teach eKash and digital banking basics",
      "Help eligible customers open BK accounts",
      "Link communities to appropriate BK channels",
    ],
  },
  {
    id: "internet",
    label: "Internet Services",
    shortLabel: "Internet",
    description: "Sell and activate 4G Home/Business and Starlink internet.",
    tasks: [
      "Promote 4G Home and Business Internet",
      "Promote Starlink solutions",
      "Generate and follow up internet leads",
      "Support registration and activation",
    ],
  },
  {
    id: "device_financing",
    label: "Device Financing",
    shortLabel: "Devices",
    description:
      "Market smartphones with clear deposit and installment terms.",
    tasks: [
      "Market available smartphones",
      "Explain deposit and installment plans",
      "Mobilize and register customers",
      "Ensure customers understand payment obligations",
    ],
  },
  {
    id: "insurance",
    label: "Insurance Services",
    shortLabel: "Insurance",
    description:
      "Train on products, onboard insurance agents, and support customer purchases.",
    tasks: [
      "Receive product training",
      "Onboard eligible insurance agents",
      "Educate and mobilize insurance customers",
      "Support registration and purchasing",
    ],
  },
  {
    id: "clean_cooking",
    label: "Clean Cooking Solutions",
    shortLabel: "Clean cooking",
    description: "Sell and demonstrate induction cookers for safer, cleaner cooking.",
    tasks: [
      "Market induction cookers",
      "Demonstrate product use",
      "Educate on convenience, safety, and efficiency",
      "Support customers through purchase",
    ],
  },
];

export const serviceLineSchema = z.enum([
  "irembo",
  "bk",
  "internet",
  "device_financing",
  "insurance",
  "clean_cooking",
]);

export function serviceLineMeta(id: ServiceLine): ServiceLineMeta {
  return SERVICE_LINES.find((item) => item.id === id) ?? SERVICE_LINES[0]!;
}
