import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { errors } from "../../lib/errors.js";
import {
  normalizeNidDigits,
  normalizeRwandaMobile,
} from "../../lib/field-validation.js";
import {
  COA_METRIC_VARIANT_CATALOG,
  type CoaVariantFieldDef,
} from "./coa-metric-variants.catalog.js";

export type PublicCoaMetricVariant = {
  id: string;
  metricId: string;
  metricKey: string;
  key: string;
  label: string;
  description?: string;
  fieldSchema: CoaVariantFieldDef[];
  enabled: boolean;
  sortOrder: number;
};

function parseFieldSchema(raw: unknown): CoaVariantFieldDef[] {
  if (!Array.isArray(raw)) return [];
  return raw as CoaVariantFieldDef[];
}

function toPublic(row: {
  id: string;
  metricId: string;
  key: string;
  label: string;
  description: string | null;
  fieldSchema: Prisma.JsonValue;
  enabled: boolean;
  sortOrder: number;
  metric: { key: string };
}): PublicCoaMetricVariant {
  return {
    id: row.id,
    metricId: row.metricId,
    metricKey: row.metric.key,
    key: row.key,
    label: row.label,
    description: row.description ?? undefined,
    fieldSchema: parseFieldSchema(row.fieldSchema),
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

/** Idempotent upsert of metric variants from the catalog. */
export async function ensureCoaMetricVariants(): Promise<number> {
  let upserted = 0;
  for (const seed of COA_METRIC_VARIANT_CATALOG) {
    const metric = await prisma.coaMetric.findUnique({
      where: { key: seed.metricKey },
      select: { id: true },
    });
    if (!metric) continue;

    await prisma.coaMetricVariant.upsert({
      where: {
        metricId_key: { metricId: metric.id, key: seed.key },
      },
      create: {
        metricId: metric.id,
        key: seed.key,
        label: seed.label,
        description: seed.description ?? null,
        fieldSchema: seed.fieldSchema as unknown as Prisma.InputJsonValue,
        enabled: seed.enabled,
        sortOrder: seed.sortOrder,
      },
      update: {
        label: seed.label,
        description: seed.description ?? null,
        fieldSchema: seed.fieldSchema as unknown as Prisma.InputJsonValue,
        sortOrder: seed.sortOrder,
        // Preserve admin-enabled toggles by not overwriting `enabled` on update.
      },
    });
    upserted += 1;
  }
  return upserted;
}

export async function listVariantsForMetric(
  metricId: string,
  opts: { includeDisabled?: boolean } = {},
): Promise<PublicCoaMetricVariant[]> {
  const rows = await prisma.coaMetricVariant.findMany({
    where: {
      metricId,
      ...(opts.includeDisabled ? {} : { enabled: true }),
    },
    include: { metric: { select: { key: true } } },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map(toPublic);
}

export async function getVariant(
  metricKey: string,
  variantKey: string,
): Promise<PublicCoaMetricVariant> {
  const metric = await prisma.coaMetric.findUnique({
    where: { key: metricKey },
    select: { id: true },
  });
  if (!metric) throw errors.notFound("Metric not found");

  const row = await prisma.coaMetricVariant.findUnique({
    where: {
      metricId_key: { metricId: metric.id, key: variantKey },
    },
    include: { metric: { select: { key: true } } },
  });
  if (!row || !row.enabled) {
    throw errors.badRequest("Internet type is unavailable");
  }
  return toPublic(row);
}

export type NormalizedClientRow = {
  fullName: string;
  phone: string | null;
  email: string | null;
  nidNumber: string | null;
  accountRef: string | null;
  simNumber: string | null;
  variantKey: string | null;
  data: Record<string, unknown> | null;
  gpsLat: number | null;
  gpsLng: number | null;
  gpsPhotoKey: string | null;
  stockUnitIds: string[];
};

type RawClientInput = {
  fullName?: string;
  phone?: string;
  email?: string;
  nidNumber?: string;
  accountRef?: string;
  simNumber?: string;
  variantKey?: string;
  data?: Record<string, unknown>;
  gpsLat?: number;
  gpsLng?: number;
  gpsPhotoKey?: string;
  stockUnitIds?: string[];
};

/**
 * Validate a client payload against a variant field schema and map into
 * legacy columns + JSON `data`.
 */
export function normalizeClientForVariant(
  input: RawClientInput,
  schema: CoaVariantFieldDef[],
  variantKey: string,
  index: number,
): NormalizedClientRow {
  const label = `Client ${index + 1}`;
  const dataIn = input.data ?? {};
  const dataOut: Record<string, unknown> = {};

  let fullName = input.fullName?.trim() ?? "";
  let phone = input.phone?.trim() ?? "";
  let email = input.email?.trim() ?? "";
  let nidNumber = input.nidNumber?.trim() ?? "";
  let accountRef = input.accountRef?.trim() ?? "";
  let simNumber = input.simNumber?.trim() ?? "";
  let gpsLat = input.gpsLat ?? null;
  let gpsLng = input.gpsLng ?? null;
  let gpsPhotoKey = input.gpsPhotoKey?.trim() || null;

  for (const field of schema) {
    const raw =
      field.type === "gps"
        ? undefined
        : field.mapsTo
          ? (input[field.mapsTo] as string | undefined) ??
            (dataIn[field.key] as string | undefined)
          : (dataIn[field.key] as string | undefined);

    if (field.type === "gps") {
      const hasCoords =
        typeof gpsLat === "number" &&
        Number.isFinite(gpsLat) &&
        typeof gpsLng === "number" &&
        Number.isFinite(gpsLng);
      if (field.required && !hasCoords && !gpsPhotoKey) {
        throw errors.badRequest(
          `${label}: GPS location is required (capture coordinates or upload a map photo)`,
        );
      }
      if (hasCoords) {
        if (gpsLat! < -90 || gpsLat! > 90 || gpsLng! < -180 || gpsLng! > 180) {
          throw errors.badRequest(`${label}: GPS coordinates are invalid`);
        }
      }
      continue;
    }

    const value = String(raw ?? "").trim();
    if (field.required && !value) {
      throw errors.badRequest(`${label}: ${field.label} is required`);
    }
    if (!value) continue;

    if (field.type === "phone") {
      const normalized = normalizeRwandaMobile(value);
      if (!/^07\d{8}$/.test(normalized)) {
        throw errors.badRequest(
          `${label}: ${field.label} must be a Rwandan mobile starting with 07`,
        );
      }
      if (field.mapsTo === "phone") phone = normalized;
      else dataOut[field.key] = normalized;
      continue;
    }

    if (field.type === "nid") {
      const nid = normalizeNidDigits(value);
      if (nid.length !== 16) {
        throw errors.badRequest(
          `${label}: ${field.label} must be exactly 16 digits`,
        );
      }
      if (field.mapsTo === "nidNumber") nidNumber = nid;
      else dataOut[field.key] = nid;
      continue;
    }

    if (field.type === "select") {
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      if (!allowed.has(value)) {
        throw errors.badRequest(`${label}: invalid ${field.label}`);
      }
    }

    if (field.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw errors.badRequest(
          `${label}: ${field.label} must be YYYY-MM-DD`,
        );
      }
    }

    if (field.mapsTo === "fullName") fullName = value;
    else if (field.mapsTo === "phone") phone = value;
    else if (field.mapsTo === "email") email = value;
    else if (field.mapsTo === "nidNumber") nidNumber = value;
    else if (field.mapsTo === "accountRef") accountRef = value;
    else if (field.mapsTo === "simNumber") simNumber = value;
    else dataOut[field.key] = value;
  }

  // Product type is implied by the variant (hbb/obb).
  if (variantKey === "hbb" || variantKey === "obb") {
    dataOut.productType = variantKey.toUpperCase();
  }

  if (!fullName || fullName.length < 2) {
    throw errors.badRequest(`${label}: customer name is required`);
  }

  const stockUnitIds = [...new Set((input.stockUnitIds ?? []).map((id) => id.trim()).filter(Boolean))];

  return {
    fullName,
    phone: phone || null,
    email: email || null,
    nidNumber: nidNumber || null,
    accountRef: accountRef || null,
    simNumber: simNumber || null,
    variantKey,
    data: Object.keys(dataOut).length > 0 ? dataOut : null,
    gpsLat,
    gpsLng,
    gpsPhotoKey,
    stockUnitIds,
  };
}
