-- CreateEnum
CREATE TYPE "ServiceLine" AS ENUM ('irembo', 'bk', 'internet', 'device_financing', 'insurance', 'clean_cooking');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "LeadEntityType" AS ENUM ('person', 'household', 'business');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "entity_type" "LeadEntityType" NOT NULL,
    "service_line" "ServiceLine" NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "interest_summary" TEXT,
    "notes" TEXT,
    "converted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "leads_tc_user_id_idx" ON "leads"("tc_user_id");

-- CreateIndex
CREATE INDEX "leads_service_line_idx" ON "leads"("service_line");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_geo_district_idx" ON "leads"("geo_district");

-- CreateIndex
CREATE INDEX "leads_updated_at_idx" ON "leads"("updated_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
