import type { Agent, AgentStatus, ComplianceTone, Prisma } from "@prisma/client";

/** API-facing status strings (match frontend demo types). */
export type ApiAgentStatus =
  | "Active"
  | "Inactive"
  | "Suspended"
  | "Pending verification";

export type AgentServices = {
  iremboTools: boolean;
  insuranceTools: boolean;
  telecomTools: boolean;
  bkTools: boolean;
  smartphone: boolean;
  printer: boolean;
  internetAvailable: boolean;
  internetType?: string;
  brandingVisible: boolean;
  trainedOnServices: boolean;
  activelySelling: boolean;
  cleanCookingTools?: boolean;
  starlinkReady?: boolean;
};

export const DEFAULT_AGENT_SERVICES: AgentServices = {
  iremboTools: true,
  insuranceTools: true,
  telecomTools: true,
  bkTools: false,
  smartphone: true,
  printer: true,
  internetAvailable: true,
  internetType: "Solektra Telecom",
  brandingVisible: true,
  trainedOnServices: true,
  activelySelling: true,
  cleanCookingTools: false,
  starlinkReady: false,
};

const STATUS_TO_API: Record<AgentStatus, ApiAgentStatus> = {
  Active: "Active",
  Inactive: "Inactive",
  Suspended: "Suspended",
  PendingVerification: "Pending verification",
};

const STATUS_FROM_API: Record<ApiAgentStatus, AgentStatus> = {
  Active: "Active",
  Inactive: "Inactive",
  Suspended: "Suspended",
  "Pending verification": "PendingVerification",
};

export function statusToApi(status: AgentStatus): ApiAgentStatus {
  return STATUS_TO_API[status];
}

export function statusFromApi(status: ApiAgentStatus): AgentStatus {
  return STATUS_FROM_API[status];
}

export function maskNidFromPhone(phone: string): string {
  return `1********${phone.replace(/\D/g, "").slice(-3)}`;
}

export function parseServices(json: Prisma.JsonValue): AgentServices {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ...DEFAULT_AGENT_SERVICES };
  }
  return { ...DEFAULT_AGENT_SERVICES, ...(json as Partial<AgentServices>) };
}

export type PublicAgent = {
  id: string;
  code: string;
  name: string;
  phone: string;
  email?: string;
  nidMasked: string;
  nidVerified: boolean;
  status: ApiAgentStatus;
  geo: {
    province: string;
    district: string;
    sector: string;
    cell: string;
  };
  registeredLocation: {
    lat: number;
    lng: number;
    accuracyMeters?: number;
  };
  tcUserId: string;
  services: AgentServices;
  lastVisitAt?: string;
  compliance: ComplianceTone;
  clientsRegistered: number;
  recruitedThisMonth: boolean;
  reactivatedThisMonth: boolean;
  createdAt: string;
  tcName?: string;
};

export function toPublicAgent(
  agent: Agent,
  tcName?: string,
): PublicAgent {
  return {
    id: agent.id,
    code: agent.code,
    name: agent.name,
    phone: agent.phone,
    email: agent.email ?? undefined,
    nidMasked: agent.nidMasked,
    nidVerified: agent.nidVerified,
    status: statusToApi(agent.status),
    geo: {
      province: agent.geoProvince,
      district: agent.geoDistrict,
      sector: agent.geoSector,
      cell: agent.geoCell,
    },
    registeredLocation: {
      lat: agent.lat,
      lng: agent.lng,
      accuracyMeters: agent.accuracyMeters ?? undefined,
    },
    tcUserId: agent.tcUserId,
    services: parseServices(agent.servicesJson),
    lastVisitAt: agent.lastVisitAt?.toISOString(),
    compliance: agent.compliance,
    clientsRegistered: agent.clientsRegistered,
    recruitedThisMonth: agent.recruitedThisMonth,
    reactivatedThisMonth: agent.reactivatedThisMonth,
    createdAt: agent.createdAt.toISOString(),
    tcName,
  };
}
