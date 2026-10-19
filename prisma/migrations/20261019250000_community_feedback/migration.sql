-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('need', 'challenge', 'opportunity');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateTable
CREATE TABLE "community_feedback" (
    "id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "service_line" "ServiceLine",
    "kind" "FeedbackKind" NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "lead_id" TEXT,
    "resolution_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_feedback_tc_user_id_idx" ON "community_feedback"("tc_user_id");

-- CreateIndex
CREATE INDEX "community_feedback_service_line_idx" ON "community_feedback"("service_line");

-- CreateIndex
CREATE INDEX "community_feedback_kind_idx" ON "community_feedback"("kind");

-- CreateIndex
CREATE INDEX "community_feedback_severity_idx" ON "community_feedback"("severity");

-- CreateIndex
CREATE INDEX "community_feedback_status_idx" ON "community_feedback"("status");

-- CreateIndex
CREATE INDEX "community_feedback_geo_district_idx" ON "community_feedback"("geo_district");

-- CreateIndex
CREATE INDEX "community_feedback_lead_id_idx" ON "community_feedback"("lead_id");

-- CreateIndex
CREATE INDEX "community_feedback_updated_at_idx" ON "community_feedback"("updated_at");

-- AddForeignKey
ALTER TABLE "community_feedback" ADD CONSTRAINT "community_feedback_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_feedback" ADD CONSTRAINT "community_feedback_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
