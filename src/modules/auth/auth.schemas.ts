import { z } from "zod";

const passwordSchema = z
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

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
