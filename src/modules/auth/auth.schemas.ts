import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long");

/**
 * Public self-registration. Role is always AGENT; account starts as pending
 * and cannot log in until an admin activates the user.
 */
export const registerBodySchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
  password: passwordSchema,
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(32).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(128),
});

/** Self-service profile edit. Email and role are admin-managed. */
export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(7).max(32).nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined, {
    message: "Provide a name or phone to update",
  });

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
