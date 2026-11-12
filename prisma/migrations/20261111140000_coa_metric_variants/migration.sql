-- CreateTable
CREATE TABLE "coa_metric_variants" (
    "id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "field_schema" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_metric_variants_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "coa_evidence_clients" ADD COLUMN "variant_key" TEXT;
ALTER TABLE "coa_evidence_clients" ADD COLUMN "data" JSONB;
ALTER TABLE "coa_evidence_clients" ADD COLUMN "gps_lat" DOUBLE PRECISION;
ALTER TABLE "coa_evidence_clients" ADD COLUMN "gps_lng" DOUBLE PRECISION;
ALTER TABLE "coa_evidence_clients" ADD COLUMN "gps_photo_key" TEXT;

-- CreateIndex
CREATE INDEX "coa_metric_variants_metric_id_sort_order_idx" ON "coa_metric_variants"("metric_id", "sort_order");

-- CreateIndex
CREATE INDEX "coa_metric_variants_enabled_idx" ON "coa_metric_variants"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "coa_metric_variants_metric_id_key_key" ON "coa_metric_variants"("metric_id", "key");

-- CreateIndex
CREATE INDEX "coa_evidence_clients_variant_key_idx" ON "coa_evidence_clients"("variant_key");

-- AddForeignKey
ALTER TABLE "coa_metric_variants" ADD CONSTRAINT "coa_metric_variants_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "coa_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
