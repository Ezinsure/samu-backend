import { z } from "zod";

/** Digits only, at most 16 (Rwanda national ID length). */
export function normalizeNidDigits(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 16);
}

/**
 * Normalize common Rwanda mobile formats to `07XXXXXXXX`.
 * Accepts 07…, 7…, +2507…, 2507…
 */
export function normalizeRwandaMobile(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("250") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.startsWith("07") && digits.length === 10) return digits;
  if (digits.startsWith("7") && digits.length === 9) return `0${digits}`;
  return digits;
}

export const rwandaNidSchema = z
  .string()
  .trim()
  .transform(normalizeNidDigits)
  .refine((v) => /^\d{1,16}$/.test(v), {
    message: "National ID must be digits only (max 16)",
  });

/** Required NID — exactly 16 digits after normalization. */
export const rwandaNidRequiredSchema = rwandaNidSchema.refine(
  (v) => v.length === 16,
  { message: "National ID must be exactly 16 digits" },
);

export const rwandaMobileSchema = z
  .string()
  .trim()
  .transform(normalizeRwandaMobile)
  .refine((v) => /^07\d{8}$/.test(v), {
    message: "Phone must be a Rwandan mobile number starting with 07",
  });

/** Optional mobile: empty/null → null; otherwise same as rwandaMobileSchema. */
export const rwandaMobileOptionalSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v == null) return null;
    const trimmed = String(v).trim();
    return trimmed === "" ? null : normalizeRwandaMobile(trimmed);
  })
  .refine((v) => v === null || /^07\d{8}$/.test(v), {
    message: "Phone must be a Rwandan mobile number starting with 07",
  });

/** Loose client/evidence phone — length only, no Rwanda format. */
export const loosePhoneSchema = z
  .string()
  .trim()
  .min(7, "Phone is too short")
  .max(32, "Phone is too long")
  .refine((v) => !/[<>;'"`\\]/.test(v), {
    message: "Phone contains invalid characters",
  });

export const personNameSchema = z
  .string()
  .trim()
  .min(2, "Name is too short")
  .max(120, "Name is too long")
  .refine((v) => !/[<>]/.test(v), { message: "Name contains invalid characters" });

export const safeShortText = (max: number, label = "Value") =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long`)
    .refine((v) => !/[<>]/.test(v), {
      message: `${label} contains invalid characters`,
    });
