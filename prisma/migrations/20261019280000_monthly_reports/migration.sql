-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'submitted', 'under_review', 'changes_requested', 'resubmitted', 'reviewed', 'evaluated');

-- CreateEnum
CREATE TYPE "ScorecardStatus" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "ScorecardDecision" AS ENUM ('Outstanding', 'Meets expectations', 'Needs improvement', 'Unsatisfactory');

-- CreateTable
CREATE TABLE "monthly_reports" (
    "id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "deadline" DATE NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "territory_snapshot_json" JSONB NOT NULL DEFAULT '[]',
    "kpi_actuals_json" JSONB NOT NULL DEFAULT '{}',
    "narrative_json" JSONB NOT NULL DEFAULT '{}',
    "agent_snapshot_json" JSONB NOT NULL DEFAULT '[]',
    "history_json" JSONB NOT NULL DEFAULT '[]',
    "review_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecards" (
    "id" TEXT NOT NULL,
    "monthly_report_id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "ScorecardStatus" NOT NULL DEFAULT 'draft',
    "template_version" TEXT NOT NULL DEFAULT 'v1-2026',
    "criteria_json" JSONB NOT NULL,
    "overall_comment" TEXT NOT NULL DEFAULT '',
    "decision" "ScorecardDecision",
    "weighted_total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evaluator_user_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scorecards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_reports_status_idx" ON "monthly_reports"("status");

-- CreateIndex
CREATE INDEX "monthly_reports_period_idx" ON "monthly_reports"("period");

-- CreateIndex
CREATE INDEX "monthly_reports_deadline_idx" ON "monthly_reports"("deadline");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_reports_tc_user_id_period_key" ON "monthly_reports"("tc_user_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "scorecards_monthly_report_id_key" ON "scorecards"("monthly_report_id");

-- CreateIndex
CREATE INDEX "scorecards_tc_user_id_idx" ON "scorecards"("tc_user_id");

-- CreateIndex
CREATE INDEX "scorecards_period_idx" ON "scorecards"("period");

-- CreateIndex
CREATE INDEX "scorecards_status_idx" ON "scorecards"("status");

-- AddForeignKey
ALTER TABLE "monthly_reports" ADD CONSTRAINT "monthly_reports_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_monthly_report_id_fkey" FOREIGN KEY ("monthly_report_id") REFERENCES "monthly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecards" ADD CONSTRAINT "scorecards_evaluator_user_id_fkey" FOREIGN KEY ("evaluator_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
