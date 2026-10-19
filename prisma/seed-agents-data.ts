import type { AgentStatus, ComplianceTone, Prisma } from "@prisma/client";

export type SeedAgentRow = {
  id: string;
  code: string;
  name: string;
  phone: string;
  province: string;
  district: string;
  sector: string;
  cell: string;
  /** Seed user email for the TC (resolved at seed time). */
  tcEmail: string;
  lat: number;
  lng: number;
  status?: AgentStatus;
  compliance: ComplianceTone;
  lastVisitAt?: string;
  services?: Prisma.InputJsonValue;
  clientsRegistered?: number;
  recruitedThisMonth?: boolean;
  reactivatedThisMonth?: boolean;
};

const defaultServices = (
  partial?: Record<string, unknown>,
): Prisma.InputJsonValue => ({
  iremboTools: true,
  insuranceTools: true,
  telecomTools: true,
  bkTools: false,
  smartphone: true,
  printer: true,
  internetAvailable: true,
  internetType: "Solektra Telecom",
  brandingVisible: true,
  trainedOnServices: true,
  activelySelling: true,
  cleanCookingTools: false,
  starlinkReady: false,
  ...partial,
});

const TC_KIGALI = "tc.kigali@solektra.rw";
const TC_SOUTH = "tc.south@solektra.rw";

/**
 * Mirrors frontend/data/agents.ts (stable ids) with TC emails instead of demo user ids.
 */
export const SEED_AGENTS: SeedAgentRow[] = [
  { id: "agent-001", code: "AGT-KGL-001", name: "Alice Mukamana", phone: "+250780000101", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri I", tcEmail: TC_KIGALI, lat: -1.9536, lng: 30.1207, compliance: "green", lastVisitAt: "2026-09-10T09:20:00.000Z", clientsRegistered: 42 },
  { id: "agent-002", code: "AGT-KGL-002", name: "Bosco Habimana", phone: "+250780000102", province: "Kigali City", district: "Gasabo", sector: "Kimironko", cell: "Kibagabaga", tcEmail: TC_KIGALI, lat: -1.9395, lng: 30.1302, compliance: "yellow", lastVisitAt: "2026-07-28T11:00:00.000Z", services: defaultServices({ printer: false, internetType: "MTN" }), clientsRegistered: 18 },
  { id: "agent-003", code: "AGT-KGL-003", name: "Chantal Ingabire", phone: "+250780000103", province: "Kigali City", district: "Kicukiro", sector: "Kanombe", cell: "Busanza", tcEmail: TC_KIGALI, lat: -1.9801, lng: 30.1684, compliance: "red", lastVisitAt: "2026-06-01T14:10:00.000Z", services: defaultServices({ insuranceTools: false, internetAvailable: false }), clientsRegistered: 9 },
  { id: "agent-004", code: "AGT-KGL-004", name: "David Nkurunziza", phone: "+250780000104", province: "Kigali City", district: "Kicukiro", sector: "Gikondo", cell: "Kanserege", tcEmail: TC_KIGALI, lat: -1.9722, lng: 30.0821, compliance: "green", lastVisitAt: "2026-09-05T08:40:00.000Z", clientsRegistered: 31 },
  { id: "agent-005", code: "AGT-KGL-005", name: "Esther Uwase", phone: "+250780000105", province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo", cell: "Biryogo", tcEmail: TC_KIGALI, lat: -1.9708, lng: 30.0445, compliance: "green", lastVisitAt: "2026-09-12T10:15:00.000Z", clientsRegistered: 27, recruitedThisMonth: true },
  { id: "agent-006", code: "AGT-KGL-006", name: "Felix Mugisha", phone: "+250780000106", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri II", tcEmail: TC_KIGALI, lat: -1.9551, lng: 30.1128, compliance: "yellow", lastVisitAt: "2026-08-01T13:00:00.000Z", services: defaultServices({ brandingVisible: false }), clientsRegistered: 14 },
  { id: "agent-007", code: "AGT-KGL-007", name: "Grace Uwimana", phone: "+250780000107", province: "Kigali City", district: "Gasabo", sector: "Kimironko", cell: "Nyagatovu", tcEmail: TC_KIGALI, lat: -1.9358, lng: 30.1255, compliance: "green", lastVisitAt: "2026-09-08T15:30:00.000Z", clientsRegistered: 36 },
  { id: "agent-008", code: "AGT-KGL-008", name: "Henri Tuyishime", phone: "+250780000108", province: "Kigali City", district: "Kicukiro", sector: "Kanombe", cell: "Kabeza", tcEmail: TC_KIGALI, lat: -1.9864, lng: 30.1522, compliance: "red", services: defaultServices({ telecomTools: false, activelySelling: false }), status: "Inactive", clientsRegistered: 3, reactivatedThisMonth: false },
  { id: "agent-009", code: "AGT-KGL-009", name: "Immaculee Nyiraneza", phone: "+250780000109", province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo", cell: "Mwendo", tcEmail: TC_KIGALI, lat: -1.9755, lng: 30.0398, compliance: "green", lastVisitAt: "2026-09-14T09:05:00.000Z", clientsRegistered: 22 },
  { id: "agent-010", code: "AGT-KGL-010", name: "Jean Claude Habineza", phone: "+250780000110", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri I", tcEmail: TC_KIGALI, lat: -1.9512, lng: 30.1181, compliance: "yellow", lastVisitAt: "2026-07-20T16:00:00.000Z", clientsRegistered: 11 },
  { id: "agent-011", code: "AGT-KGL-011", name: "Keza Aline", phone: "+250780000111", province: "Kigali City", district: "Kicukiro", sector: "Gikondo", cell: "Kanserege", tcEmail: TC_KIGALI, lat: -1.9699, lng: 30.0794, compliance: "green", lastVisitAt: "2026-09-11T12:20:00.000Z", clientsRegistered: 29 },
  { id: "agent-012", code: "AGT-KGL-012", name: "Laurent Bizimana", phone: "+250780000112", province: "Kigali City", district: "Gasabo", sector: "Kimironko", cell: "Kibagabaga", tcEmail: TC_KIGALI, lat: -1.9421, lng: 30.1338, compliance: "green", lastVisitAt: "2026-09-03T08:10:00.000Z", services: defaultServices({ bkTools: true }), clientsRegistered: 47 },
  { id: "agent-013", code: "AGT-KGL-013", name: "Marie Claire Umutoni", phone: "+250780000113", province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo", cell: "Biryogo", tcEmail: TC_KIGALI, lat: -1.9687, lng: 30.0472, compliance: "red", lastVisitAt: "2026-05-18T10:00:00.000Z", clientsRegistered: 7 },
  { id: "agent-014", code: "AGT-KGL-014", name: "Nathan Iradukunda", phone: "+250780000114", province: "Kigali City", district: "Kicukiro", sector: "Kanombe", cell: "Busanza", tcEmail: TC_KIGALI, lat: -1.9788, lng: 30.1611, compliance: "yellow", lastVisitAt: "2026-08-05T14:45:00.000Z", clientsRegistered: 16 },
  { id: "agent-015", code: "AGT-KGL-015", name: "Olive Mukeshimana", phone: "+250780000115", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri II", tcEmail: TC_KIGALI, lat: -1.9569, lng: 30.1159, compliance: "green", lastVisitAt: "2026-09-15T11:30:00.000Z", clientsRegistered: 33 },
  { id: "agent-016", code: "AGT-KGL-016", name: "Patrick Nsengimana", phone: "+250780000116", province: "Kigali City", district: "Gasabo", sector: "Kimironko", cell: "Nyagatovu", tcEmail: TC_KIGALI, lat: -1.9372, lng: 30.1288, compliance: "green", lastVisitAt: "2026-09-09T09:50:00.000Z", clientsRegistered: 25 },
  { id: "agent-017", code: "AGT-KGL-017", name: "Queen Irakoze", phone: "+250780000117", province: "Kigali City", district: "Kicukiro", sector: "Gikondo", cell: "Kanserege", tcEmail: TC_KIGALI, lat: -1.9741, lng: 30.0855, compliance: "yellow", lastVisitAt: "2026-07-30T13:15:00.000Z", services: defaultServices({ internetType: "Airtel" }), clientsRegistered: 13 },
  { id: "agent-018", code: "AGT-KGL-018", name: "Roger Hakizimana", phone: "+250780000118", province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo", cell: "Mwendo", tcEmail: TC_KIGALI, lat: -1.9772, lng: 30.0411, compliance: "green", lastVisitAt: "2026-09-07T16:40:00.000Z", clientsRegistered: 21 },
  { id: "agent-019", code: "AGT-KGL-019", name: "Solange Uwamahoro", phone: "+250780000119", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri I", tcEmail: TC_KIGALI, lat: -1.9501, lng: 30.1224, compliance: "green", lastVisitAt: "2026-09-13T08:55:00.000Z", clientsRegistered: 38 },
  { id: "agent-020", code: "AGT-KGL-020", name: "Theogene Munyaneza", phone: "+250780000120", province: "Kigali City", district: "Kicukiro", sector: "Kanombe", cell: "Kabeza", tcEmail: TC_KIGALI, lat: -1.9842, lng: 30.1558, compliance: "red", lastVisitAt: "2026-06-22T11:20:00.000Z", status: "Suspended", clientsRegistered: 5 },
  { id: "agent-021", code: "AGT-STH-001", name: "Uwase Ange", phone: "+250780000201", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Butare", tcEmail: TC_SOUTH, lat: -2.5967, lng: 29.7394, compliance: "green", lastVisitAt: "2026-09-06T10:00:00.000Z", clientsRegistered: 19 },
  { id: "agent-022", code: "AGT-STH-002", name: "Vianney Ndayisaba", phone: "+250780000202", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Matyazo", tcEmail: TC_SOUTH, lat: -2.6012, lng: 29.7451, compliance: "yellow", lastVisitAt: "2026-08-02T09:30:00.000Z", clientsRegistered: 12 },
  { id: "agent-023", code: "AGT-STH-003", name: "Winnie Mukamurenzi", phone: "+250780000203", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Gahogo", tcEmail: TC_SOUTH, lat: -2.0855, lng: 29.7528, compliance: "green", lastVisitAt: "2026-09-11T14:00:00.000Z", clientsRegistered: 24, recruitedThisMonth: true },
  { id: "agent-024", code: "AGT-STH-004", name: "Yves Habyarimana", phone: "+250780000204", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Kavumu", tcEmail: TC_SOUTH, lat: -2.0911, lng: 29.7602, compliance: "red", lastVisitAt: "2026-05-30T12:00:00.000Z", services: defaultServices({ printer: false, insuranceTools: false }), clientsRegistered: 6 },
  { id: "agent-025", code: "AGT-STH-005", name: "Zainab Ishimwe", phone: "+250780000205", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Butare", tcEmail: TC_SOUTH, lat: -2.5938, lng: 29.7422, compliance: "green", lastVisitAt: "2026-09-14T08:20:00.000Z", clientsRegistered: 28 },
  { id: "agent-026", code: "AGT-STH-006", name: "Alexis Nsabimana", phone: "+250780000206", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Gahogo", tcEmail: TC_SOUTH, lat: -2.0888, lng: 29.7489, compliance: "yellow", lastVisitAt: "2026-07-25T15:10:00.000Z", clientsRegistered: 10, reactivatedThisMonth: true },
  { id: "agent-027", code: "AGT-STH-007", name: "Beatrice Mukandayisenga", phone: "+250780000207", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Matyazo", tcEmail: TC_SOUTH, lat: -2.6055, lng: 29.7377, compliance: "green", lastVisitAt: "2026-09-04T11:45:00.000Z", clientsRegistered: 17 },
  { id: "agent-028", code: "AGT-STH-008", name: "Clementine Uwera", phone: "+250780000208", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Kavumu", tcEmail: TC_SOUTH, lat: -2.0944, lng: 29.7555, compliance: "green", lastVisitAt: "2026-09-12T13:25:00.000Z", clientsRegistered: 20 },
  { id: "agent-029", code: "AGT-STH-009", name: "Daniel Hategekimana", phone: "+250780000209", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Butare", tcEmail: TC_SOUTH, lat: -2.5989, lng: 29.7488, compliance: "red", status: "Inactive", clientsRegistered: 2 },
  { id: "agent-030", code: "AGT-STH-010", name: "Emeline Nyirahabimana", phone: "+250780000210", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Gahogo", tcEmail: TC_SOUTH, lat: -2.0822, lng: 29.7511, compliance: "green", lastVisitAt: "2026-09-08T10:35:00.000Z", clientsRegistered: 15 },
  { id: "agent-031", code: "AGT-EST-001", name: "Fabrice Mugabo", phone: "+250780000301", province: "Eastern Province", district: "Rwamagana", sector: "Kigabiro", cell: "Rwamagana", tcEmail: TC_KIGALI, lat: -1.9525, lng: 30.4377, compliance: "yellow", lastVisitAt: "2026-08-10T09:00:00.000Z", clientsRegistered: 8 },
  { id: "agent-032", code: "AGT-NTH-001", name: "Gisele Uwimana", phone: "+250780000401", province: "Northern Province", district: "Musanze", sector: "Muhoza", cell: "Musanze", tcEmail: TC_SOUTH, lat: -1.4991, lng: 29.6331, compliance: "green", lastVisitAt: "2026-09-02T12:00:00.000Z", clientsRegistered: 14 },
  { id: "agent-033", code: "AGT-WST-001", name: "Hubert Niyonzima", phone: "+250780000501", province: "Western Province", district: "Rubavu", sector: "Gisenyi", cell: "Rubavu", tcEmail: TC_SOUTH, lat: -1.7025, lng: 29.2544, compliance: "yellow", lastVisitAt: "2026-07-18T11:00:00.000Z", clientsRegistered: 11 },
  { id: "agent-034", code: "AGT-KGL-021", name: "Irene Mukazayire", phone: "+250780000121", province: "Kigali City", district: "Gasabo", sector: "Remera", cell: "Rukiri I", tcEmail: TC_KIGALI, lat: -1.9544, lng: 30.1195, compliance: "green", lastVisitAt: "2026-09-16T09:10:00.000Z", clientsRegistered: 26, status: "PendingVerification" },
  { id: "agent-035", code: "AGT-KGL-022", name: "Jules Byiringiro", phone: "+250780000122", province: "Kigali City", district: "Kicukiro", sector: "Kanombe", cell: "Busanza", tcEmail: TC_KIGALI, lat: -1.9815, lng: 30.1662, compliance: "green", lastVisitAt: "2026-09-01T15:00:00.000Z", clientsRegistered: 30 },
  { id: "agent-036", code: "AGT-KGL-023", name: "Kevin Mugisha", phone: "+250780000123", province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo", cell: "Biryogo", tcEmail: TC_KIGALI, lat: -1.9719, lng: 30.0461, compliance: "yellow", lastVisitAt: "2026-08-08T10:40:00.000Z", clientsRegistered: 12 },
  { id: "agent-037", code: "AGT-STH-011", name: "Liliane Uwase", phone: "+250780000211", province: "Southern Province", district: "Huye", sector: "Ngoma", cell: "Butare", tcEmail: TC_SOUTH, lat: -2.5951, lng: 29.7415, compliance: "green", lastVisitAt: "2026-09-10T13:50:00.000Z", clientsRegistered: 18 },
  { id: "agent-038", code: "AGT-STH-012", name: "Michel Nshimiyimana", phone: "+250780000212", province: "Southern Province", district: "Muhanga", sector: "Nyamabuye", cell: "Gahogo", tcEmail: TC_SOUTH, lat: -2.0867, lng: 29.7544, compliance: "red", lastVisitAt: "2026-06-12T09:15:00.000Z", clientsRegistered: 4 },
  { id: "agent-039", code: "AGT-KGL-024", name: "Nadia Uwera", phone: "+250780000124", province: "Kigali City", district: "Gasabo", sector: "Kimironko", cell: "Kibagabaga", tcEmail: TC_KIGALI, lat: -1.9408, lng: 30.1319, compliance: "green", lastVisitAt: "2026-09-15T16:05:00.000Z", clientsRegistered: 35 },
  { id: "agent-040", code: "AGT-KGL-025", name: "Oscar Habimana", phone: "+250780000125", province: "Kigali City", district: "Kicukiro", sector: "Gikondo", cell: "Kanserege", tcEmail: TC_KIGALI, lat: -1.9715, lng: 30.0812, compliance: "green", lastVisitAt: "2026-09-14T12:40:00.000Z", clientsRegistered: 23 },
].map((row) => ({
  ...row,
  services: row.services ?? defaultServices(),
}));
