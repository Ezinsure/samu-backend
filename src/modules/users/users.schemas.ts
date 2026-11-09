import { z } from "zod";
import {
  personNameSchema,
  rwandaMobileOptionalSchema,
  rwandaNidRequiredSchema,
  safeShortText,
} from "../../lib/field-validation.js";
import { passwordSchema } from "../auth/auth.schemas.js";

const provinceSchema = safeShortText(120, "Province").min(2).nullable().optional();
const districtSchema = safeShortText(120, "District").min(2).nullable().optional();
/** Raw national ID digits; stored masked. Null clears. */
const nidSchema = z.union([rwandaNidRequiredSchema, z.null()]).optional();

/** Roles an admin may assign when creating/updating users (product surface). */
export const userRoleSchema = z.enum([
  "ADMIN",
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
  "AGENT",
]);

/** Includes soft-removed legacy roles for list filters on existing rows. */
export const userRoleFilterSchema = z.enum([
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
  "COMMUNITY_OPPORTUNITY_ASSOCIATE",
  "AGENT",
]);

export const userStatusSchema = z.enum(["active", "pending", "disabled"]);

const emailSchema = z
  .string()
  .email()
  .max(320)
  .transform((v) => v.toLowerCase().trim());

const nameSchema = personNameSchema;
const phoneSchema = rwandaMobileOptionalSchema;

export const userIdParamSchema = z.object({ id: z.string().min(1) });

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  role: userRoleFilterSchema.optional(),
  status: userStatusSchema.optional(),
});

/**
 * Admin-created account. Omit `password` to email the user a set-password
 * link instead (the account then has no usable password until they set one).
 */
export const userCreateSchema = z.object({
  email: emailSchema,
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  role: userRoleSchema,
  /** Portal link for AGENT users; ignored for every other role. */
  agentId: z.string().min(1).nullable().optional(),
  password: passwordSchema.optional(),
  workingProvince: provinceSchema,
  workingDistrict: districtSchema,
  nid: nidSchema,
});

export const userUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
    agentId: z.string().min(1).nullable().optional(),
    workingProvince: provinceSchema,
    workingDistrict: districtSchema,
    nid: nidSchema,
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  });

export const setPasswordSchema = z.object({ password: passwordSchema });

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
