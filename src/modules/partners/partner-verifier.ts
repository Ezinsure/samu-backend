/**
 * Partner verification adapters.
 * Ezinsure HTTP contract is documented in DOCs/Ezinsure-Partner-Verify-API.md
 */

import { env } from "../../config/env.js";
import { logger } from "../../lib/logger.js";

export type PartnerVerifyOutcomeStatus =
  | "verified"
  | "not_found"
  | "error";

export type PartnerVerifyApplicantInput = {
  samuApplicantId: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  nidNumber?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
};

export type PartnerVerifyRequest = {
  /** Idempotency / correlation id for this single check. */
  requestId: string;
  partnerKey: string;
  applicant: PartnerVerifyApplicantInput;
};

export type PartnerVerifyResult = {
  status: PartnerVerifyOutcomeStatus;
  externalRef?: string | null;
  message?: string | null;
  /** Raw partner payload (or mock payload) stored on the applicant. */
  raw: unknown;
};

export interface PartnerVerifier {
  readonly name: string;
  verify(request: PartnerVerifyRequest): Promise<PartnerVerifyResult>;
}

/** Deterministic mock so QA can exercise all statuses without Ezinsure. */
export class MockEzinsureVerifier implements PartnerVerifier {
  readonly name = "mock";

  async verify(request: PartnerVerifyRequest): Promise<PartnerVerifyResult> {
    const phone = (request.applicant.phone ?? "").replace(/\D/g, "");
    const email = (request.applicant.email ?? "").toLowerCase();
    const name = request.applicant.fullName.toLowerCase();

    if (
      email.includes("+error") ||
      name.includes("[error]") ||
      phone.endsWith("0000")
    ) {
      return {
        status: "error",
        message: "Mock partner error (phone ends 0000 / +error email)",
        raw: { mock: true, reason: "forced_error", requestId: request.requestId },
      };
    }

    if (
      email.includes("+missing") ||
      name.includes("[missing]") ||
      (phone.length > 0 && Number(phone.slice(-1)) % 2 === 0)
    ) {
      return {
        status: "not_found",
        message: "Mock: applicant not found in Ezinsure",
        raw: { mock: true, reason: "not_found", requestId: request.requestId },
      };
    }

    const externalRef = `EZ-MOCK-${request.applicant.samuApplicantId.slice(-8).toUpperCase()}`;
    return {
      status: "verified",
      externalRef,
      message: "Mock: applicant verified",
      raw: {
        mock: true,
        reason: "verified",
        requestId: request.requestId,
        externalRef,
      },
    };
  }
}

/**
 * Calls the partner-implemented HTTP endpoint.
 * Expected request/response shapes: DOCs/Ezinsure-Partner-Verify-API.md
 */
export class HttpEzinsureVerifier implements PartnerVerifier {
  readonly name = "http";

  constructor(
    private readonly url: string,
    private readonly apiKey?: string,
  ) {}

  async verify(request: PartnerVerifyRequest): Promise<PartnerVerifyResult> {
    const body = {
      requestId: request.requestId,
      partnerKey: request.partnerKey,
      applicant: {
        samuApplicantId: request.applicant.samuApplicantId,
        fullName: request.applicant.fullName,
        phone: request.applicant.phone ?? null,
        email: request.applicant.email ?? null,
        nidNumber: request.applicant.nidNumber ?? null,
        province: request.applicant.province ?? null,
        district: request.applicant.district ?? null,
        sector: request.applicant.sector ?? null,
        cell: request.applicant.cell ?? null,
      },
    };

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Samu-Request-Id": request.requestId,
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Partner request failed";
      return {
        status: "error",
        message,
        raw: { transportError: true, message },
      };
    }

    let payload: unknown = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = { nonJsonBody: text.slice(0, 2000) };
      }
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload &&
        "message" in payload &&
        typeof (payload as { message: unknown }).message === "string"
          ? (payload as { message: string }).message
          : `Partner HTTP ${response.status}`;
      return {
        status: "error",
        message,
        raw: { httpStatus: response.status, body: payload },
      };
    }

    const parsed = normalizePartnerPayload(payload);
    if (!parsed) {
      return {
        status: "error",
        message: "Partner response missing status field",
        raw: { httpStatus: response.status, body: payload },
      };
    }

    if (parsed.status === "verified" && !parsed.externalRef) {
      return {
        status: "error",
        message: "Partner returned verified without externalRef",
        raw: { httpStatus: response.status, body: payload },
      };
    }

    return {
      status: parsed.status,
      externalRef: parsed.externalRef,
      message: parsed.message,
      raw: { httpStatus: response.status, body: payload },
    };
  }
}

function normalizePartnerPayload(payload: unknown): {
  status: PartnerVerifyOutcomeStatus;
  externalRef?: string | null;
  message?: string | null;
} | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  const status = obj.status;
  if (status !== "verified" && status !== "not_found" && status !== "error") {
    return null;
  }
  return {
    status,
    externalRef:
      typeof obj.externalRef === "string"
        ? obj.externalRef
        : typeof obj.external_ref === "string"
          ? obj.external_ref
          : null,
    message: typeof obj.message === "string" ? obj.message : null,
  };
}

export function resolveEzinsureVerifier(): PartnerVerifier {
  const mode = env.EZINSURE_VERIFY_MODE;
  if (mode === "http" && env.EZINSURE_VERIFY_URL) {
    logger.info(
      { url: env.EZINSURE_VERIFY_URL },
      "Using HTTP Ezinsure verifier",
    );
    return new HttpEzinsureVerifier(
      env.EZINSURE_VERIFY_URL,
      env.EZINSURE_VERIFY_API_KEY,
    );
  }
  if (mode === "http" && !env.EZINSURE_VERIFY_URL) {
    logger.warn(
      "EZINSURE_VERIFY_MODE=http but EZINSURE_VERIFY_URL unset — falling back to mock",
    );
  }
  return new MockEzinsureVerifier();
}

/** Public contract snapshot for admins / partner onboarding. */
export function getEzinsureVerifyContract() {
  return {
    partner: "ezinsure",
    adapter: resolveEzinsureVerifier().name,
    mode: env.EZINSURE_VERIFY_MODE,
    configuredUrl: env.EZINSURE_VERIFY_URL ?? null,
    method: "POST",
    pathHint: env.EZINSURE_VERIFY_URL ?? "https://{partner-host}/v1/samu/verify-applicant",
    auth: "Authorization: Bearer {EZINSURE_VERIFY_API_KEY}",
    docs: "DOCs/Ezinsure-Partner-Verify-API.md",
    requestExample: {
      requestId: "clx_request_cuid",
      partnerKey: "ezinsure",
      applicant: {
        samuApplicantId: "clx_applicant_cuid",
        fullName: "Jane Uwase",
        phone: "+250788000111",
        email: "jane@example.com",
        nidNumber: "1199xxxxxxxxxxxx",
        province: "Kigali",
        district: "Gasabo",
        sector: "Remera",
        cell: "Rukiri I",
      },
    },
    responseExamples: {
      verified: {
        status: "verified",
        externalRef: "EZ-123456",
        message: "Applicant found and active",
      },
      not_found: {
        status: "not_found",
        message: "No matching applicant",
      },
      error: {
        status: "error",
        message: "Upstream timeout",
      },
    },
    mockRules: {
      verified: "Default when phone last digit is odd (or empty phone)",
      not_found: "Phone last digit even, or email contains +missing",
      error: "Phone ends with 0000, or email contains +error",
    },
  };
}
