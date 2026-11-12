-- CreateEnum
CREATE TYPE "PartnerVerificationRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "PartnerVerificationRunScope" AS ENUM ('selected', 'unverified_all');

-- CreateTable
CREATE TABLE "partner_verification_runs" (
    "id" TEXT NOT NULL,
    "partner_key" TEXT NOT NULL,
    "triggered_by_user_id" TEXT NOT NULL,
    "scope" "PartnerVerificationRunScope" NOT NULL,
    "status" "PartnerVerificationRunStatus" NOT NULL DEFAULT 'pending',
    "applicant_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "month" TEXT,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "verified_count" INTEGER NOT NULL DEFAULT 0,
    "not_found_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "adapter" TEXT NOT NULL DEFAULT 'mock',
    "last_error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_verification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partner_verification_runs_partner_key_created_at_idx" ON "partner_verification_runs"("partner_key", "created_at");

-- CreateIndex
CREATE INDEX "partner_verification_runs_status_idx" ON "partner_verification_runs"("status");

-- CreateIndex
CREATE INDEX "partner_verification_runs_triggered_by_user_id_idx" ON "partner_verification_runs"("triggered_by_user_id");

-- AddForeignKey
ALTER TABLE "partner_verification_runs" ADD CONSTRAINT "partner_verification_runs_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
