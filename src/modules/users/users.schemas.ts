import { z } from "zod";
import { passwordSchema } from "../auth/auth.schemas.js";

export const userRoleSchema = z.enum([
  "ADMIN",
  "OPERATIONS_MANAGER",
  "MD_VIEWER",
  "TERRITORY_COORDINATOR",
  "AGENT",
]);

export const userStatusSchema = z.enum(["active", "pending", "disabled"]);

const emailSchema = z
  .string()
  .email()
  .max(320)
  .transform((v) => v.toLowerCase().trim());

const nameSchema = z.string().trim().min(2).max(120);
const phoneSchema = z.string().trim().min(7).max(32);

export const userIdParamSchema = z.object({ id: z.string().min(1) });

export const userListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  role: userRoleSchema.optional(),
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
});

export const userUpdateSchema = z
  .object({
    email: emailSchema.optional(),
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
    agentId: z.string().min(1).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((value) => value !== undefined), {
    message: "Provide at least one field to update",
  });

export const setPasswordSchema = z.object({ password: passwordSchema });

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
