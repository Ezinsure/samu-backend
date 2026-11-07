import { z } from "zod";
import {
  personNameSchema,
  rwandaMobileOptionalSchema,
  rwandaNidRequiredSchema,
  safeShortText,
} from "../../lib/field-validation.js";

/** Strong password: length + upper + lower + digit + special character. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

/**
 * Public self-registration. Role is always AGENT; account starts as pending
 * and cannot log in until an admin activates the user.
 */
export const registerBodySchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
  password: passwordSchema,
  name: personNameSchema,
  phone: rwandaMobileOptionalSchema,
});

export const loginBodySchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

/** Self-service profile edit. Email and role are admin-managed. */
export const updateProfileBodySchema = z
  .object({
    name: personNameSchema.optional(),
    phone: rwandaMobileOptionalSchema,
    workingProvince: safeShortText(120, "Province")
      .min(2)
      .nullable()
      .optional(),
    workingDistrict: safeShortText(120, "District")
      .min(2)
      .nullable()
      .optional(),
    /** Raw national ID digits; stored masked. Null clears. */
    nid: z.union([rwandaNidRequiredSchema, z.null()]).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.phone !== undefined ||
      v.workingProvince !== undefined ||
      v.workingDistrict !== undefined ||
      v.nid !== undefined,
    { message: "Provide at least one profile field to update" },
  );

export const changePasswordBodySchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "New password must be different from the current password",
    path: ["newPassword"],
  });

export const forgotPasswordBodySchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
