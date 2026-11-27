import { errors } from "../../lib/errors.js";

export type StockAttributeFieldDef = {
  key: string;
  label: string;
  type: "text" | "select";
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export type StockAttributesSchema = {
  fields: StockAttributeFieldDef[];
};

/** Parse type.attributesSchema JSON into a typed field list. */
export function parseAttributesSchema(raw: unknown): StockAttributeFieldDef[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const fields = (raw as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
    .map((f) => ({
      key: String(f.key ?? "").trim(),
      label: String(f.label ?? f.key ?? "").trim() || "Field",
      type: f.type === "select" ? ("select" as const) : ("text" as const),
      required: Boolean(f.required),
      options: Array.isArray(f.options)
        ? f.options
            .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
            .map((o) => ({
              value: String(o.value ?? "").trim(),
              label: String(o.label ?? o.value ?? "").trim(),
            }))
            .filter((o) => o.value)
        : undefined,
      placeholder:
        typeof f.placeholder === "string" ? f.placeholder : undefined,
    }))
    .filter((f) => f.key);
}

/**
 * Validate and normalize attribute payload against a type schema.
 * Returns a clean object suitable for StockUnit.attributes.
 */
export function normalizeUnitAttributes(
  schemaRaw: unknown,
  input: Record<string, unknown> | undefined,
  contextLabel: string,
): Record<string, string> | null {
  const fields = parseAttributesSchema(schemaRaw);
  if (fields.length === 0) {
    if (!input || Object.keys(input).length === 0) return null;
    // Allow free-form extras only when schema is empty (legacy / future).
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      const v = String(value ?? "").trim();
      if (v) out[key] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  const out: Record<string, string> = {};
  for (const field of fields) {
    const raw = input?.[field.key];
    const value = String(raw ?? "").trim();
    if (field.required && !value) {
      throw errors.badRequest(
        `${contextLabel}: ${field.label} is required`,
      );
    }
    if (!value) continue;
    if (field.type === "select" && field.options?.length) {
      const allowed = new Set(field.options.map((o) => o.value));
      if (!allowed.has(value)) {
        throw errors.badRequest(
          `${contextLabel}: invalid ${field.label}`,
        );
      }
    }
    out[field.key] = value.slice(0, 120);
  }
  return Object.keys(out).length ? out : null;
}

export function formatAttributeLabel(
  attrs: Record<string, unknown> | null | undefined,
): string | null {
  if (!attrs) return null;
  const category =
    typeof attrs.category === "string" ? attrs.category.trim() : "";
  if (category) return category;
  const brand =
    typeof attrs.brand === "string" ? attrs.brand.trim() : "";
  const model =
    typeof attrs.model === "string" ? attrs.model.trim() : "";
  if (brand && model) return `${brand} · ${model}`;
  if (brand) return brand;
  if (model) return model;
  return null;
}

/** Display label like `Router (HBB)` or `Smartphone · Samsung · A17`. */
export function formatTypeWithAttributes(
  typeLabel: string,
  attrs: Record<string, unknown> | null | undefined,
): string {
  if (!attrs) return typeLabel;
  const category =
    typeof attrs.category === "string" ? attrs.category.trim() : "";
  if (category) return `${typeLabel} (${category})`;
  const detail = formatAttributeLabel(attrs);
  return detail ? `${typeLabel} · ${detail}` : typeLabel;
}
