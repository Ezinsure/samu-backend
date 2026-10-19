-- CreateEnum
CREATE TYPE "OnboardingKind" AS ENUM ('customer', 'irembo_agent', 'insurance_agent', 'bk_account', 'internet_activation', 'device_registration', 'cooker_purchase');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('not_started', 'in_progress', 'pending_partner', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "onboarding_cases" (
    "id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "service_line" "ServiceLine" NOT NULL,
    "kind" "OnboardingKind" NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'not_started',
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "lead_id" TEXT,
    "agent_id" TEXT,
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "stage_label" TEXT NOT NULL,
    "notes" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "onboarding_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "onboarding_cases_tc_user_id_idx" ON "onboarding_cases"("tc_user_id");

-- CreateIndex
CREATE INDEX "onboarding_cases_service_line_idx" ON "onboarding_cases"("service_line");

-- CreateIndex
CREATE INDEX "onboarding_cases_status_idx" ON "onboarding_cases"("status");

-- CreateIndex
CREATE INDEX "onboarding_cases_kind_idx" ON "onboarding_cases"("kind");

-- CreateIndex
CREATE INDEX "onboarding_cases_geo_district_idx" ON "onboarding_cases"("geo_district");

-- CreateIndex
CREATE INDEX "onboarding_cases_lead_id_idx" ON "onboarding_cases"("lead_id");

-- CreateIndex
CREATE INDEX "onboarding_cases_agent_id_idx" ON "onboarding_cases"("agent_id");

-- CreateIndex
CREATE INDEX "onboarding_cases_updated_at_idx" ON "onboarding_cases"("updated_at");

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_cases" ADD CONSTRAINT "onboarding_cases_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
