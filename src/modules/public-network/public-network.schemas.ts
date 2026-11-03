import { z } from "zod";

export const publicRegisterSchema = z.object({
  inviteToken: z.string().trim().min(8).max(80).optional(),
  amazina: z.string().trim().min(2).max(120),
  nimeroIrangamuntu: z.string().trim().min(5).max(20),
  imyaka: z.coerce.number().int().min(16).max(100),
  igitsina: z.enum(["Gabo", "Gore"]),
  telefone: z.string().trim().min(7).max(32),
  email: z.string().email().max(320),
  amashuri: z.enum([
    "Amashuri atatu yisumbuye",
    "Narangije ayisumbuye",
    "Narangije kaminuza",
  ]),
  tin: z.string().trim().min(1).max(40),
  ubwokoBizinesi: z.string().trim().min(1).max(200),
  akarere: z.string().trim().min(1).max(120),
  umurenge: z.string().trim().min(1).max(120),
  akagari: z.string().trim().min(1).max(120),
  umudugudu: z.string().trim().min(1).max(120),
  isibo: z.string().trim().min(1).max(120),
  venue: z.string().trim().min(1).max(200),
  emergencyName: z.string().trim().min(1).max(120),
  emergencyPhone: z.string().trim().min(7).max(32),
  criminalRecordBillId: z.string().trim().min(1).max(80),
  certificateStorageKey: z.string().trim().max(500).optional(),
  hasPrinterScanner: z.boolean(),
  hasComputer: z.boolean(),
  officeType: z.enum(["kiosk", "room", "desk"]),
  building: z.string().trim().min(1).max(200),
  province: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export type PublicRegisterInput = z.infer<typeof publicRegisterSchema>;
