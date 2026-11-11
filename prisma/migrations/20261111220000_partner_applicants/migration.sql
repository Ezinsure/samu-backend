-- CreateEnum
CREATE TYPE "PartnerVerificationStatus" AS ENUM ('unverified', 'verified', 'not_found', 'error');

-- CreateTable
CREATE TABLE "partner_applicants" (
    "id" TEXT NOT NULL,
    "partner_key" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "nid_number" TEXT,
    "province" TEXT,
    "district" TEXT,
    "sector" TEXT,
    "cell" TEXT,
    "month" TEXT NOT NULL,
    "logged_by_user_id" TEXT NOT NULL,
    "entry_id" TEXT,
    "client_row_id" TEXT,
    "verification_status" "PartnerVerificationStatus" NOT NULL DEFAULT 'unverified',
    "external_ref" TEXT,
    "last_check_payload" JSONB,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_applicants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partner_applicants_client_row_id_key" ON "partner_applicants"("client_row_id");

-- CreateIndex
CREATE INDEX "partner_applicants_partner_key_month_idx" ON "partner_applicants"("partner_key", "month");

-- CreateIndex
CREATE INDEX "partner_applicants_logged_by_user_id_month_idx" ON "partner_applicants"("logged_by_user_id", "month");

-- CreateIndex
CREATE INDEX "partner_applicants_verification_status_idx" ON "partner_applicants"("verification_status");

-- CreateIndex
CREATE INDEX "partner_applicants_entry_id_idx" ON "partner_applicants"("entry_id");

-- CreateIndex
CREATE INDEX "partner_applicants_partner_key_verification_status_idx" ON "partner_applicants"("partner_key", "verification_status");

-- AddForeignKey
ALTER TABLE "partner_applicants" ADD CONSTRAINT "partner_applicants_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_applicants" ADD CONSTRAINT "partner_applicants_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "coa_performance_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Ezinsure applicants from existing COA evidence client rows.
INSERT INTO "partner_applicants" (
  "id",
  "partner_key",
  "full_name",
  "phone",
  "email",
  "nid_number",
  "province",
  "district",
  "sector",
  "cell",
  "month",
  "logged_by_user_id",
  "entry_id",
  "client_row_id",
  "verification_status",
  "created_at",
  "updated_at"
)
SELECT
  'pa_' || replace(c.id, '-', ''),
  'ezinsure',
  c.full_name,
  c.phone,
  c.email,
  c.nid_number,
  NULLIF(c.data->>'province', ''),
  NULLIF(c.data->>'district', ''),
  NULLIF(c.data->>'sector', ''),
  NULLIF(c.data->>'cell', ''),
  e.month,
  e.coa_user_id,
  e.id,
  c.id,
  'unverified',
  c.created_at,
  CURRENT_TIMESTAMP
FROM "coa_evidence_clients" c
INNER JOIN "coa_performance_entries" e ON e.id = c.entry_id
INNER JOIN "coa_metrics" m ON m.id = e.metric_id
WHERE m.key = 'ezinsure_agents_applied'
ON CONFLICT ("client_row_id") DO NOTHING;
