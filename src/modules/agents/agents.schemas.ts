import { z } from "zod";

export const agentStatusSchema = z.enum([
  "Active",
  "Inactive",
  "Suspended",
  "Pending verification",
]);

export const complianceSchema = z.enum(["green", "yellow", "red"]);

export const agentServicesSchema = z.object({
  iremboTools: z.boolean(),
  insuranceTools: z.boolean(),
  telecomTools: z.boolean(),
  bkTools: z.boolean(),
  smartphone: z.boolean(),
  printer: z.boolean(),
  internetAvailable: z.boolean(),
  internetType: z.string().max(80).optional(),
  brandingVisible: z.boolean(),
  trainedOnServices: z.boolean(),
  activelySelling: z.boolean(),
  cleanCookingTools: z.boolean().optional(),
  starlinkReady: z.boolean().optional(),
});

export const geoSchema = z.object({
  province: z.string().trim().min(1).max(120),
  district: z.string().trim().min(1).max(120),
  sector: z.string().trim().min(1).max(120),
  cell: z.string().trim().min(1).max(120),
});

export const agentInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(32),
  email: z
    .union([z.string().email().max(320), z.literal("")])
    .optional(),
  code: z.string().trim().min(3).max(40).optional(),
  status: agentStatusSchema,
  geo: geoSchema,
  registeredLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  tcUserId: z.string().min(1),
  services: agentServicesSchema,
  clientsRegistered: z.number().int().min(0).optional(),
  recruitedThisMonth: z.boolean().optional(),
  reactivatedThisMonth: z.boolean().optional(),
  nidVerified: z.boolean().optional(),
});

export const agentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  province: z.string().trim().max(120).optional(),
  district: z.string().trim().max(120).optional(),
  status: agentStatusSchema.optional(),
  compliance: complianceSchema.optional(),
  tcUserId: z.string().min(1).optional(),
  sortBy: z.enum(["name", "lastVisit", "status"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const agentIdParamSchema = z.object({
  id: z.string().min(1),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentListQuery = z.infer<typeof agentListQuerySchema>;
