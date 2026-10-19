-- CreateEnum
CREATE TYPE "SaleProductCategory" AS ENUM ('internet_4g', 'internet_starlink', 'smartphone', 'induction_cooker', 'insurance_policy', 'other');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "service_line" "ServiceLine" NOT NULL,
    "product_category" "SaleProductCategory" NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount_rwf" INTEGER NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "lead_id" TEXT,
    "onboarding_id" TEXT,
    "deposit_rwf" INTEGER,
    "installment_months" INTEGER,
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_tc_user_id_idx" ON "sales"("tc_user_id");

-- CreateIndex
CREATE INDEX "sales_service_line_idx" ON "sales"("service_line");

-- CreateIndex
CREATE INDEX "sales_product_category_idx" ON "sales"("product_category");

-- CreateIndex
CREATE INDEX "sales_geo_district_idx" ON "sales"("geo_district");

-- CreateIndex
CREATE INDEX "sales_sold_at_idx" ON "sales"("sold_at");

-- CreateIndex
CREATE INDEX "sales_lead_id_idx" ON "sales"("lead_id");

-- CreateIndex
CREATE INDEX "sales_onboarding_id_idx" ON "sales"("onboarding_id");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_onboarding_id_fkey" FOREIGN KEY ("onboarding_id") REFERENCES "onboarding_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
