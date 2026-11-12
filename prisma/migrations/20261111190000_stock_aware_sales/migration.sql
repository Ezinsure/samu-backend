-- AlterTable
ALTER TABLE "sales" ADD COLUMN "sim_stock_unit_id" TEXT,
ADD COLUMN "router_stock_unit_id" TEXT,
ADD COLUMN "customer_returned_at" TIMESTAMP(3),
ADD COLUMN "customer_return_reason" TEXT;

-- AlterTable
ALTER TABLE "coa_evidence_clients" ADD COLUMN "stock_unit_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "customer_returned_at" TIMESTAMP(3),
ADD COLUMN "customer_return_reason" TEXT;

-- CreateIndex
CREATE INDEX "sales_sim_stock_unit_id_idx" ON "sales"("sim_stock_unit_id");

-- CreateIndex
CREATE INDEX "sales_router_stock_unit_id_idx" ON "sales"("router_stock_unit_id");
