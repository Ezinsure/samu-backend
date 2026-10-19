import type { Sale, SaleProductCategory, ServiceLine } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { errors } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { prisma } from "../../lib/prisma.js";
import { isNationalReader } from "../../lib/tc-scope.js";
import type { AuthUser } from "../../types/express.js";
import type { SaleInput, SaleListQuery } from "./sales.schemas.js";

export type PublicSale = {
  id: string;
  tcUserId: string;
  serviceLine: ServiceLine;
  productCategory: SaleProductCategory;
  productName: string;
  quantity: number;
  amountRwf: number;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  onboardingId?: string;
  depositRwf?: number;
  installmentMonths?: number;
  geo: { province: string; district: string; sector: string };
  soldAt: string;
  notes?: string;
  tcName?: string;
};

function canWriteCoap(role: AuthUser["role"]): boolean {
  return (
    role === "ADMIN" ||
    role === "OPERATIONS_MANAGER" ||
    role === "TERRITORY_COORDINATOR"
  );
}

function toPublic(row: Sale, tcName?: string): PublicSale {
  return {
    id: row.id,
    tcUserId: row.tcUserId,
    serviceLine: row.serviceLine,
    productCategory: row.productCategory,
    productName: row.productName,
    quantity: row.quantity,
    amountRwf: row.amountRwf,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    leadId: row.leadId ?? undefined,
    onboardingId: row.onboardingId ?? undefined,
    depositRwf: row.depositRwf ?? undefined,
    installmentMonths: row.installmentMonths ?? undefined,
    geo: {
      province: row.geoProvince,
      district: row.geoDistrict,
      sector: row.geoSector,
    },
    soldAt: row.soldAt.toISOString(),
    notes: row.notes ?? undefined,
    tcName,
  };
}

function assertCanView(tcUserId: string, viewer: AuthUser): void {
  if (isNationalReader(viewer.role) || viewer.role === "ADMIN") return;
  if (viewer.role === "TERRITORY_COORDINATOR" && tcUserId === viewer.id) {
    return;
  }
  throw errors.forbidden();
}

async function assertActiveTc(tcUserId: string): Promise<void> {
  const tc = await prisma.user.findFirst({
    where: {
      id: tcUserId,
      role: "TERRITORY_COORDINATOR",
      status: "active",
    },
  });
  if (!tc) {
    throw errors.badRequest("Selected user is not an active territory coordinator");
  }
}

async function resolveTcUserId(
  input: SaleInput,
  viewer: AuthUser,
): Promise<string> {
  if (viewer.role === "TERRITORY_COORDINATOR") {
    return viewer.id;
  }
  const tcUserId = input.tcUserId;
  if (!tcUserId) {
    throw errors.badRequest("tcUserId is required");
  }
  await assertActiveTc(tcUserId);
  return tcUserId;
}

async function assertOptionalRefs(
  leadId: string | undefined,
  onboardingId: string | undefined,
): Promise<void> {
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw errors.badRequest("leadId does not exist");
  }
  if (onboardingId) {
    const caseRow = await prisma.onboardingCase.findUnique({
      where: { id: onboardingId },
    });
    if (!caseRow) throw errors.badRequest("onboardingId does not exist");
  }
}

/**
 * Paginated sales — TC-scoped; national readers see all.
 */
export async function listSales(
  query: SaleListQuery,
  viewer: AuthUser,
): Promise<{
  data: PublicSale[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const where: Prisma.SaleWhereInput = {};

  if (viewer.role === "TERRITORY_COORDINATOR") {
    where.tcUserId = viewer.id;
  } else if (!isNationalReader(viewer.role) && viewer.role !== "ADMIN") {
    return {
      data: [],
      meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    };
  }

  if (query.serviceLine) where.serviceLine = query.serviceLine;
  if (query.tcUserId) where.tcUserId = query.tcUserId;
  if (query.search) {
    where.OR = [
      { customerName: { contains: query.search, mode: "insensitive" } },
      { productName: { contains: query.search, mode: "insensitive" } },
      { geoDistrict: { contains: query.search, mode: "insensitive" } },
    ];
  }

  const total = await prisma.sale.count({ where });
  const rows = await prisma.sale.findMany({
    where,
    include: { tcUser: { select: { name: true } } },
    orderBy: { soldAt: "desc" },
    skip: (query.page - 1) * query.pageSize,
    take: query.pageSize,
  });

  return {
    data: rows.map((row) => toPublic(row, row.tcUser.name)),
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    },
  };
}

/** Single sale by id (scoped). */
export async function getSaleById(
  id: string,
  viewer: AuthUser,
): Promise<PublicSale> {
  const row = await prisma.sale.findUnique({
    where: { id },
    include: { tcUser: { select: { name: true } } },
  });
  if (!row) {
    throw errors.notFound("Sale not found");
  }
  assertCanView(row.tcUserId, viewer);
  return toPublic(row, row.tcUser.name);
}

/** Create sale (Admin / Ops / TC). */
export async function createSale(
  input: SaleInput,
  viewer: AuthUser,
): Promise<PublicSale> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to create sales");
  }

  const tcUserId = await resolveTcUserId(input, viewer);
  await assertOptionalRefs(input.leadId, input.onboardingId);

  const id = `sale-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = await prisma.sale.create({
    data: {
      id,
      tcUserId,
      serviceLine: input.serviceLine,
      productCategory: input.productCategory,
      productName: input.productName.trim(),
      quantity: input.quantity,
      amountRwf: input.amountRwf,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      leadId: input.leadId ?? null,
      onboardingId: input.onboardingId ?? null,
      depositRwf: input.depositRwf ?? null,
      installmentMonths: input.installmentMonths ?? null,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      soldAt: new Date(input.soldAt),
      notes: input.notes?.trim() || null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info(
    { saleId: row.id, amountRwf: row.amountRwf, actorUserId: viewer.id },
    "Sale created",
  );

  return toPublic(row, row.tcUser.name);
}

/** Update sale (Admin / Ops / owning TC). */
export async function updateSale(
  id: string,
  input: SaleInput,
  viewer: AuthUser,
): Promise<PublicSale> {
  if (!canWriteCoap(viewer.role)) {
    throw errors.forbidden("Not allowed to update sales");
  }

  const existing = await prisma.sale.findUnique({ where: { id } });
  if (!existing) {
    throw errors.notFound("Sale not found");
  }

  if (
    viewer.role === "TERRITORY_COORDINATOR" &&
    existing.tcUserId !== viewer.id
  ) {
    throw errors.forbidden("Sale not in your territory");
  }

  let tcUserId = existing.tcUserId;
  if (
    (viewer.role === "ADMIN" || viewer.role === "OPERATIONS_MANAGER") &&
    input.tcUserId &&
    input.tcUserId !== existing.tcUserId
  ) {
    await assertActiveTc(input.tcUserId);
    tcUserId = input.tcUserId;
  }

  await assertOptionalRefs(input.leadId, input.onboardingId);

  const row = await prisma.sale.update({
    where: { id },
    data: {
      tcUserId,
      serviceLine: input.serviceLine,
      productCategory: input.productCategory,
      productName: input.productName.trim(),
      quantity: input.quantity,
      amountRwf: input.amountRwf,
      customerName: input.customerName.trim(),
      customerPhone: input.customerPhone.trim(),
      leadId: input.leadId ?? null,
      onboardingId: input.onboardingId ?? null,
      depositRwf: input.depositRwf ?? null,
      installmentMonths: input.installmentMonths ?? null,
      geoProvince: input.geo.province,
      geoDistrict: input.geo.district,
      geoSector: input.geo.sector,
      soldAt: new Date(input.soldAt),
      notes: input.notes?.trim() || null,
    },
    include: { tcUser: { select: { name: true } } },
  });

  logger.info({ saleId: id, actorUserId: viewer.id }, "Sale updated");
  return toPublic(row, row.tcUser.name);
}
