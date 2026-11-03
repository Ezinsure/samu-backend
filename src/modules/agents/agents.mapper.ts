import type {
  Agent,
  AgentStatus,
  ComplianceTone,
  OfficeType,
  Prisma,
  ReviewStatus,
} from "@prisma/client";

/** API-facing lifecycle status (Agent candidate → Irembo agent). */
export type ApiAgentStatus =
  | "Candidate"
  | "InTraining"
  | "ExamPending"
  | "Certified"
  | "Inactive";

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
  Candidate: "Candidate",
  InTraining: "InTraining",
  ExamPending: "ExamPending",
  Certified: "Certified",
  Inactive: "Inactive",
};

const STATUS_FROM_API: Record<ApiAgentStatus, AgentStatus> = {
  Candidate: "Candidate",
  InTraining: "InTraining",
  ExamPending: "ExamPending",
  Certified: "Certified",
  Inactive: "Inactive",
};

export function statusToApi(status: AgentStatus): ApiAgentStatus {
  return STATUS_TO_API[status];
}

export function statusFromApi(status: ApiAgentStatus): AgentStatus {
  return STATUS_FROM_API[status];
}

/** Human label: Agent candidate vs Irembo agent. */
export function networkRoleLabel(status: AgentStatus | ApiAgentStatus): string {
  return status === "Certified" ? "Irembo agent" : "Agent candidate";
}

export function lifecycleStatusLabel(
  status: AgentStatus | ApiAgentStatus,
): string {
  switch (status) {
    case "Candidate":
      return "Candidate";
    case "InTraining":
      return "In training";
    case "ExamPending":
      return "Exam pending";
    case "Certified":
      return "Certified";
    case "Inactive":
      return "Inactive";
    default:
      return String(status);
  }
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
  networkRole: "Agent candidate" | "Irembo agent";
  lifecycleLabel: string;
  reviewStatus: ReviewStatus;
  age?: number;
  gender?: string;
  education?: string;
  tin?: string;
  businessType?: string;
  venue?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  criminalRecordBillId?: string;
  certificateStorageKey?: string;
  hasPrinterScanner: boolean;
  hasComputer: boolean;
  officeType?: OfficeType;
  building?: string;
  geo: {
    province: string;
    district: string;
    sector: string;
    cell: string;
    village?: string;
  };
  registeredLocation: {
    lat: number;
    lng: number;
    accuracyMeters?: number;
  };
  tcUserId?: string;
  recruitedByUserId?: string;
  examScore?: number;
  iremboAccountCreatedAt?: string;
  services: AgentServices;
  lastVisitAt?: string;
  compliance: ComplianceTone;
  clientsRegistered: number;
  recruitedThisMonth: boolean;
  reactivatedThisMonth: boolean;
  createdAt: string;
  tcName?: string;
  recruitedByName?: string;
};

export function toPublicAgent(
  agent: Agent,
  extras?: { tcName?: string; recruitedByName?: string },
): PublicAgent {
  const status = statusToApi(agent.status);
  return {
    id: agent.id,
    code: agent.code,
    name: agent.name,
    phone: agent.phone,
    email: agent.email ?? undefined,
    nidMasked: agent.nidMasked,
    nidVerified: agent.nidVerified,
    status,
    networkRole: networkRoleLabel(status) as "Agent candidate" | "Irembo agent",
    lifecycleLabel: lifecycleStatusLabel(status),
    reviewStatus: agent.reviewStatus,
    age: agent.age ?? undefined,
    gender: agent.gender ?? undefined,
    education: agent.education ?? undefined,
    tin: agent.tin ?? undefined,
    businessType: agent.businessType ?? undefined,
    venue: agent.venue ?? undefined,
    emergencyContactName: agent.emergencyContactName ?? undefined,
    emergencyContactPhone: agent.emergencyContactPhone ?? undefined,
    criminalRecordBillId: agent.criminalRecordBillId ?? undefined,
    certificateStorageKey: agent.certificateStorageKey ?? undefined,
    hasPrinterScanner: agent.hasPrinterScanner,
    hasComputer: agent.hasComputer,
    officeType: agent.officeType ?? undefined,
    building: agent.building ?? undefined,
    geo: {
      province: agent.geoProvince,
      district: agent.geoDistrict,
      sector: agent.geoSector,
      cell: agent.geoCell,
      village: agent.geoVillage ?? undefined,
    },
    registeredLocation: {
      lat: agent.lat,
      lng: agent.lng,
      accuracyMeters: agent.accuracyMeters ?? undefined,
    },
    tcUserId: agent.tcUserId ?? undefined,
    recruitedByUserId: agent.recruitedByUserId ?? undefined,
    examScore: agent.examScore ?? undefined,
    iremboAccountCreatedAt: agent.iremboAccountCreatedAt?.toISOString(),
    services: parseServices(agent.servicesJson),
    lastVisitAt: agent.lastVisitAt?.toISOString(),
    compliance: agent.compliance,
    clientsRegistered: agent.clientsRegistered,
    recruitedThisMonth: agent.recruitedThisMonth,
    reactivatedThisMonth: agent.reactivatedThisMonth,
    createdAt: agent.createdAt.toISOString(),
    tcName: extras?.tcName,
    recruitedByName: extras?.recruitedByName,
  };
}
