import { z } from "zod";
import {
  personNameSchema,
  rwandaMobileSchema,
  rwandaNidRequiredSchema,
  safeShortText,
} from "../../lib/field-validation.js";

export const publicRegisterSchema = z.object({
  inviteToken: z.string().trim().min(8).max(80).optional(),
  amazina: personNameSchema,
  nimeroIrangamuntu: rwandaNidRequiredSchema,
  imyaka: z.coerce.number().int().min(16).max(100),
  igitsina: z.enum(["Gabo", "Gore"]),
  telefone: rwandaMobileSchema,
  email: z.string().email().max(320),
  amashuri: z.enum([
    "Amashuri atatu yisumbuye",
    "Narangije ayisumbuye",
    "Narangije kaminuza",
  ]),
  tin: safeShortText(40, "TIN").min(1),
  ubwokoBizinesi: safeShortText(200, "Business type").min(1),
  akarere: safeShortText(120, "District").min(1),
  umurenge: safeShortText(120, "Sector").min(1),
  akagari: safeShortText(120, "Cell").min(1),
  umudugudu: safeShortText(120, "Village").min(1),
  isibo: safeShortText(120, "Isibo").min(1),
  venue: safeShortText(200, "Venue").min(1),
  emergencyName: personNameSchema,
  emergencyPhone: rwandaMobileSchema,
  criminalRecordBillId: safeShortText(80, "Bill ID").min(1),
  certificateStorageKey: z.string().trim().max(500).optional(),
  hasPrinterScanner: z.boolean(),
  hasComputer: z.boolean(),
  officeType: z.enum(["kiosk", "room", "desk"]),
  building: safeShortText(200, "Building").min(1),
  province: safeShortText(120, "Province").min(1),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type PublicRegisterInput = z.infer<typeof publicRegisterSchema>;
