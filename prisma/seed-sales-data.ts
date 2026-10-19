import type { SaleProductCategory, ServiceLine } from "@prisma/client";

export type SeedSaleRow = {
  id: string;
  tcEmail: string;
  serviceLine: ServiceLine;
  productCategory: SaleProductCategory;
  productName: string;
  quantity: number;
  amountRwf: number;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  onboardingId?: string;
  depositRwf?: number;
  installmentMonths?: number;
  province: string;
  district: string;
  sector: string;
  soldAt: string;
  notes?: string;
};

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/** Mirrors frontend/data/coap.ts SALE_RECORDS with TC emails. */
export const SEED_SALES: SeedSaleRow[] = [
  {
    id: "sale-001",
    tcEmail: TC_KIGALI,
    serviceLine: "clean_cooking",
    productCategory: "induction_cooker",
    productName: "Solektra Induction Cooker 2000W",
    quantity: 1,
    amountRwf: 185000,
    customerName: "Pauline Iradukunda",
    customerPhone: "+250788100105",
    leadId: "lead-005",
    onboardingId: "ob-005",
    province: "Kigali City",
    district: "Kicukiro",
    sector: "Gikondo",
    soldAt: "2026-09-06T15:30:00.000Z",
  },
  {
    id: "sale-002",
    tcEmail: TC_KIGALI,
    serviceLine: "device_financing",
    productCategory: "smartphone",
    productName: "Entry smartphone 64GB",
    quantity: 1,
    amountRwf: 220000,
    depositRwf: 40000,
    installmentMonths: 6,
    customerName: "Grace Mukamana",
    customerPhone: "+250788100104",
    leadId: "lead-004",
    onboardingId: "ob-004",
    province: "Kigali City",
    district: "Gasabo",
    sector: "Kimironko",
    soldAt: "2026-09-13T11:00:00.000Z",
    notes: "Deposit paid; installments start next month",
  },
  {
    id: "sale-003",
    tcEmail: TC_KIGALI,
    serviceLine: "internet",
    productCategory: "internet_4g",
    productName: "4G Business 50Mbps",
    quantity: 1,
    amountRwf: 45000,
    customerName: "Kigali Tailors Co-op",
    customerPhone: "+250788100102",
    leadId: "lead-002",
    onboardingId: "ob-003",
    province: "Kigali City",
    district: "Nyarugenge",
    sector: "Nyamirambo",
    soldAt: "2026-09-12T09:00:00.000Z",
  },
  {
    id: "sale-004",
    tcEmail: TC_SOUTH,
    serviceLine: "insurance",
    productCategory: "insurance_policy",
    productName: "Family health micro-insurance",
    quantity: 1,
    amountRwf: 15000,
    customerName: "Family group — Ngoma",
    customerPhone: "+250788100106",
    province: "Southern Province",
    district: "Huye",
    sector: "Ngoma",
    soldAt: "2026-09-08T13:00:00.000Z",
  },
];
