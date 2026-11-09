import * as XLSX from "xlsx";
import { env } from "../../config/env.js";
import { writeAuditLog } from "../../lib/audit.js";
import { coaCredentialsEmail } from "../../lib/email-templates.js";
import { errors } from "../../lib/errors.js";
import {
  normalizeNidDigits,
  normalizeRwandaMobile,
} from "../../lib/field-validation.js";
import { logger } from "../../lib/logger.js";
import { sendMail } from "../../lib/mailer.js";
import { hashPassword } from "../../lib/password.js";
import { prisma } from "../../lib/prisma.js";
import { generateTempPassword } from "../../lib/tokens.js";
import type { AuthUser } from "../../types/express.js";
import { initialsFromName } from "../auth/auth.service.js";
import type { InviteStatus } from "./users.service.js";

type RequestMeta = { ip?: string; userAgent?: string };

const MAX_IMPORT_ROWS = 500;

const HEADER_ALIASES: Record<string, keyof ParsedCoaRow> = {
  name: "name",
  fullname: "name",
  full_name: "name",
  fullnames: "name",
  full_names: "name",
  amazina: "name",
  email: "email",
  phone: "phone",
  telefone: "phone",
  mobile: "phone",
  telephone: "phone",
  phonenumber: "phone",
  phone_number: "phone",
  nid: "nid",
  nationalid: "nid",
  national_id: "nid",
  nimeroirangamuntu: "nid",
  idnumber: "nid",
  id_number: "nid",
  id: "nid",
  workingdistrict: "workingDistrict",
  working_district: "workingDistrict",
  district: "workingDistrict",
  akarere: "workingDistrict",
  workingdistrictlocation: "workingDistrict",
  working_district_location: "workingDistrict",
};

type ParsedCoaRow = {
  name: string;
  email: string;
  phone: string;
  nid?: string;
  workingDistrict: string;
};

export type CoaImportPreviewStatus =
  | "ready"
  | "invalid"
  | "duplicate_in_file"
  | "exists";

export type CoaImportPreviewRow = {
  row: number;
  name: string;
  email: string;
  phone: string;
  nid?: string;
  workingDistrict: string;
  status: CoaImportPreviewStatus;
  reason?: string;
};

export type CoaImportPreview = {
  filename: string;
  total: number;
  ready: number;
  invalid: number;
  duplicates: number;
  exists: number;
  rows: CoaImportPreviewRow[];
};

export type CoaImportRowResult = {
  row: number;
  email: string;
  name?: string;
  phone?: string;
  status: "created" | "skipped";
  invite?: InviteStatus;
  reason?: string;
};

export type CoaImportResult = {
  created: number;
  skipped: number;
  invites: {
    sent: number;
    failed: number;
    not_configured: number;
  };
  rows: CoaImportRowResult[];
};

function requireAdmin(actor: AuthUser) {
  if (actor.role !== "ADMIN") {
    throw errors.forbidden("Only ADMIN can import COA accounts");
  }
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function maskNid(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `1********${digits.slice(-3)}`;
}

/**
 * Coerce Excel cell values to strings without losing NID digits.
 * Numeric NIDs must not become scientific notation (`1.19987E+15`).
 */
function cellString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value) && Math.abs(value) >= 1e9) {
      return BigInt(Math.trunc(value)).toString();
    }
    // Phones typed as numbers (e.g. 787993351) — keep integer digits.
    if (Number.isInteger(value)) {
      return BigInt(Math.trunc(value)).toString();
    }
    return String(value);
  }
  const text = String(value).trim();
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n) && Number.isSafeInteger(Math.trunc(n))) {
      return BigInt(Math.trunc(n)).toString();
    }
  }
  return text;
}

/** RFC-ish CSV split that keeps quoted commas intact. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function rowsFromCsv(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]!).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = cells[idx] ?? "";
    });
    return row;
  });
}

function rowsFromWorkbook(buffer: Buffer): Record<string, string>[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  // raw:true keeps full NID integers; raw:false turns some into "1.19987E+15".
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
  return raw.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeHeader(key)] = cellString(value);
    }
    return mapped;
  });
}

function resolveField(header: string): keyof ParsedCoaRow | undefined {
  const key = normalizeHeader(header);
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replace(/_/g, "")];
}

function mapRawRow(
  raw: Record<string, string>,
): { ok: true; value: ParsedCoaRow } | { ok: false; reason: string; partial: Partial<ParsedCoaRow> } {
  const picked: Partial<ParsedCoaRow> = {};
  for (const [key, value] of Object.entries(raw)) {
    const field = resolveField(key);
    if (!field) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (field === "email") picked.email = trimmed.toLowerCase();
    else if (field === "nid") picked.nid = trimmed;
    else if (field === "phone") picked.phone = trimmed;
    else picked[field] = trimmed;
  }

  const email = picked.email ?? "";
  if (!picked.name || picked.name.length < 2) {
    return {
      ok: false,
      reason: "Name is required (min 2 characters)",
      partial: picked,
    };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "Valid email is required", partial: picked };
  }
  const phone = picked.phone ? normalizeRwandaMobile(picked.phone) : "";
  if (!/^07\d{8}$/.test(phone)) {
    return {
      ok: false,
      reason: "Phone must be a Rwandan mobile number starting with 07",
      partial: { ...picked, phone },
    };
  }
  if (!picked.workingDistrict || picked.workingDistrict.length < 2) {
    return {
      ok: false,
      reason: "Working district is required",
      partial: { ...picked, phone },
    };
  }
  if (picked.name.length > 120) {
    return { ok: false, reason: "Name is too long", partial: { ...picked, phone } };
  }
  if (picked.workingDistrict.length > 120) {
    return {
      ok: false,
      reason: "Working district is too long",
      partial: { ...picked, phone },
    };
  }
  if (picked.nid) {
    const nid = normalizeNidDigits(picked.nid);
    if (!/^\d{1,16}$/.test(nid)) {
      return {
        ok: false,
        reason: "National ID must be digits only (max 16)",
        partial: { ...picked, phone },
      };
    }
    if (nid.length > 0 && nid.length < 16) {
      return {
        ok: false,
        reason: "National ID must be exactly 16 digits",
        partial: { ...picked, phone, nid },
      };
    }
    picked.nid = nid;
  }

  return {
    ok: true,
    value: {
      name: picked.name.trim(),
      email,
      phone,
      nid: picked.nid,
      workingDistrict: picked.workingDistrict.trim(),
    },
  };
}

function parseUpload(
  buffer: Buffer,
  filename: string,
): Record<string, string>[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return rowsFromCsv(buffer.toString("utf8"));
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return rowsFromWorkbook(buffer);
  }
  try {
    const rows = rowsFromWorkbook(buffer);
    if (rows.length > 0) return rows;
  } catch {
    // fall through
  }
  return rowsFromCsv(buffer.toString("utf8"));
}

function assertUploadFile(file: {
  buffer: Buffer;
  originalname: string;
  size: number;
}) {
  if (!file.buffer?.length) {
    throw errors.badRequest("Upload a non-empty CSV or Excel file");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw errors.badRequest("Import file must be 5 MB or smaller");
  }
}

export function coaImportTemplateCsv(): string {
  return [
    "name,email,phone,nid,workingDistrict",
    "Jean Uwimana,jean.uwimana@example.com,0788000001,1199880012345678,Gasabo",
    "Marie Mukamana,marie.mukamana@example.com,+250788000002,,Kicukiro",
  ].join("\n");
}

type ValidatedRow =
  | {
      row: number;
      status: "ready";
      value: ParsedCoaRow;
    }
  | {
      row: number;
      status: Exclude<CoaImportPreviewStatus, "ready">;
      value: Partial<ParsedCoaRow>;
      reason: string;
    };

async function validateUploadRows(
  file: { buffer: Buffer; originalname: string; size: number },
): Promise<ValidatedRow[]> {
  assertUploadFile(file);
  const rawRows = parseUpload(file.buffer, file.originalname || "import.csv");
  if (rawRows.length === 0) {
    throw errors.badRequest("No data rows found in the file");
  }
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw errors.badRequest(`Import is limited to ${MAX_IMPORT_ROWS} rows`);
  }

  const seenEmails = new Set<string>();
  const validated: ValidatedRow[] = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const rowNumber = i + 2; // header is row 1
    const mapped = mapRawRow(rawRows[i]!);
    if (!mapped.ok) {
      validated.push({
        row: rowNumber,
        status: "invalid",
        value: mapped.partial,
        reason: mapped.reason,
      });
      continue;
    }

    const row = mapped.value;
    if (seenEmails.has(row.email)) {
      validated.push({
        row: rowNumber,
        status: "duplicate_in_file",
        value: row,
        reason: "Duplicate email in file",
      });
      continue;
    }
    seenEmails.add(row.email);

    const existing = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true },
    });
    if (existing) {
      validated.push({
        row: rowNumber,
        status: "exists",
        value: row,
        reason: "An account with this email already exists",
      });
      continue;
    }

    validated.push({ row: rowNumber, status: "ready", value: row });
  }

  return validated;
}

function toPreviewRow(entry: ValidatedRow): CoaImportPreviewRow {
  return {
    row: entry.row,
    name: entry.value.name ?? "",
    email: entry.value.email ?? "",
    phone: entry.value.phone ?? "",
    nid: entry.value.nid,
    workingDistrict: entry.value.workingDistrict ?? "",
    status: entry.status,
    reason: entry.status === "ready" ? undefined : entry.reason,
  };
}

/**
 * Parse + validate an upload without creating accounts — for admin preview.
 */
export async function previewCoaImport(
  file: { buffer: Buffer; originalname: string; size: number },
  actor: AuthUser,
): Promise<CoaImportPreview> {
  requireAdmin(actor);
  const validated = await validateUploadRows(file);
  const rows = validated.map(toPreviewRow);
  return {
    filename: file.originalname || "import.csv",
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    invalid: rows.filter((r) => r.status === "invalid").length,
    duplicates: rows.filter((r) => r.status === "duplicate_in_file").length,
    exists: rows.filter((r) => r.status === "exists").length,
    rows,
  };
}

/**
 * Bulk-provision COA accounts from Excel/CSV: temporary passwords emailed in a
 * branded message; users must change password on first sign-in.
 */
export async function importCoaAccounts(
  file: { buffer: Buffer; originalname: string; size: number },
  actor: AuthUser,
  meta?: RequestMeta,
): Promise<CoaImportResult> {
  requireAdmin(actor);

  const validated = await validateUploadRows(file);
  const results: CoaImportRowResult[] = [];
  const invites = { sent: 0, failed: 0, not_configured: 0 };
  let created = 0;
  let skipped = 0;
  const loginUrl = `${env.FRONTEND_ORIGIN}/login`;

  for (const entry of validated) {
    if (entry.status !== "ready") {
      skipped += 1;
      results.push({
        row: entry.row,
        email: entry.value.email || "(missing)",
        name: entry.value.name,
        phone: entry.value.phone,
        status: "skipped",
        reason: entry.reason,
      });
      continue;
    }

    const row = entry.value;
    // Re-check existence in case of races between preview and confirm.
    const existing = await prisma.user.findUnique({
      where: { email: row.email },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      results.push({
        row: entry.row,
        email: row.email,
        name: row.name,
        phone: row.phone,
        status: "skipped",
        reason: "An account with this email already exists",
      });
      continue;
    }

    const temporaryPassword = generateTempPassword();
    const nidMasked = row.nid ? maskNid(row.nid) : null;
    const passwordHash = await hashPassword(temporaryPassword);

    const user = await prisma.user.create({
      data: {
        email: row.email,
        name: row.name,
        phone: row.phone,
        role: "COMMUNITY_OPPORTUNITY_ASSOCIATE",
        status: "active",
        passwordHash,
        mustChangePassword: true,
        avatarInitials: initialsFromName(row.name),
        nidMasked,
        workingDistrict: row.workingDistrict,
      },
    });

    let invite: InviteStatus = "failed";
    try {
      const mail = await sendMail(
        coaCredentialsEmail({
          to: user.email,
          name: user.name,
          email: user.email,
          temporaryPassword,
          loginUrl,
        }),
      );
      invite = mail.delivered ? "sent" : "not_configured";
    } catch (error) {
      logger.error(
        { err: error, userId: user.id },
        "Failed to send COA credentials email",
      );
      invite = "failed";
    }

    if (invite === "sent") invites.sent += 1;
    else if (invite === "not_configured") invites.not_configured += 1;
    else invites.failed += 1;

    created += 1;
    results.push({
      row: entry.row,
      email: row.email,
      name: row.name,
      phone: row.phone,
      status: "created",
      invite,
    });
  }

  await writeAuditLog({
    actorUserId: actor.id,
    action: "user.coa_import",
    objectType: "user",
    objectId: actor.id,
    summary: `${actor.name} imported COA accounts from ${file.originalname}: ${created} created, ${skipped} skipped (invites sent=${invites.sent}, failed=${invites.failed}, not_configured=${invites.not_configured}).`,
    ip: meta?.ip,
    userAgent: meta?.userAgent,
  });

  return { created, skipped, invites, rows: results };
}
