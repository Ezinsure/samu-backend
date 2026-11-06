-- CreateEnum
CREATE TYPE "CoaEvidenceType" AS ENUM ('client_rows', 'file_upload', 'auto_irembo');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar_url" TEXT;
ALTER TABLE "users" ADD COLUMN "nid_masked" TEXT;
ALTER TABLE "users" ADD COLUMN "working_province" TEXT;
ALTER TABLE "users" ADD COLUMN "working_district" TEXT;

-- CreateIndex
CREATE INDEX "users_working_district_idx" ON "users"("working_district");

-- CreateTable
CREATE TABLE "coa_metrics" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "admin_note" TEXT,
    "monthly_target" INTEGER NOT NULL,
    "evidence_type" "CoaEvidenceType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_metric_overrides" (
    "id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "coa_user_id" TEXT NOT NULL,
    "monthly_target" INTEGER,
    "enabled" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_metric_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_performance_entries" (
    "id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "coa_user_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "notes" TEXT,
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coa_performance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_evidence_clients" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "nid_number" TEXT,
    "account_ref" TEXT,
    "sim_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coa_evidence_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coa_evidence_files" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coa_evidence_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coa_metrics_key_key" ON "coa_metrics"("key");
CREATE INDEX "coa_metrics_enabled_idx" ON "coa_metrics"("enabled");
CREATE INDEX "coa_metrics_sort_order_idx" ON "coa_metrics"("sort_order");

CREATE UNIQUE INDEX "coa_metric_overrides_metric_id_coa_user_id_key" ON "coa_metric_overrides"("metric_id", "coa_user_id");
CREATE INDEX "coa_metric_overrides_coa_user_id_idx" ON "coa_metric_overrides"("coa_user_id");

CREATE INDEX "coa_performance_entries_coa_user_id_month_idx" ON "coa_performance_entries"("coa_user_id", "month");
CREATE INDEX "coa_performance_entries_metric_id_month_idx" ON "coa_performance_entries"("metric_id", "month");
CREATE INDEX "coa_performance_entries_logged_at_idx" ON "coa_performance_entries"("logged_at");

CREATE INDEX "coa_evidence_clients_entry_id_idx" ON "coa_evidence_clients"("entry_id");
CREATE INDEX "coa_evidence_clients_phone_idx" ON "coa_evidence_clients"("phone");

CREATE INDEX "coa_evidence_files_entry_id_idx" ON "coa_evidence_files"("entry_id");
CREATE INDEX "coa_evidence_files_storage_key_idx" ON "coa_evidence_files"("storage_key");

-- AddForeignKey
ALTER TABLE "coa_metric_overrides" ADD CONSTRAINT "coa_metric_overrides_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "coa_metrics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coa_metric_overrides" ADD CONSTRAINT "coa_metric_overrides_coa_user_id_fkey" FOREIGN KEY ("coa_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coa_performance_entries" ADD CONSTRAINT "coa_performance_entries_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "coa_metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coa_performance_entries" ADD CONSTRAINT "coa_performance_entries_coa_user_id_fkey" FOREIGN KEY ("coa_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coa_evidence_clients" ADD CONSTRAINT "coa_evidence_clients_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "coa_performance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "coa_evidence_files" ADD CONSTRAINT "coa_evidence_files_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "coa_performance_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
