-- CreateEnum
CREATE TYPE "VisitValidation" AS ENUM ('accepted', 'flagged', 'rejected');

-- CreateEnum
CREATE TYPE "SmsConfirmationStatus" AS ENUM ('pending', 'confirmed', 'disputed', 'expired', 'delivery_failed');

-- CreateEnum
CREATE TYPE "FraudSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "FraudStatus" AS ENUM ('open', 'escalated', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "activities" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_from_registered_meters" INTEGER NOT NULL,
    "validation" "VisitValidation" NOT NULL,
    "confirmation_status" "SmsConfirmationStatus" NOT NULL DEFAULT 'pending',
    "challenges" TEXT,
    "support_needed" TEXT,
    "flagged_reason" TEXT,
    "checklist_json" JSONB,
    "service_lines_json" JSONB,
    "device_info" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_photos" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fraud_flags" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "FraudSeverity" NOT NULL,
    "status" "FraudStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT,
    "resolution" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" TEXT,
    "review_history_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fraud_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visits_idempotency_key_key" ON "visits"("idempotency_key");

-- CreateIndex
CREATE INDEX "visits_agent_id_idx" ON "visits"("agent_id");

-- CreateIndex
CREATE INDEX "visits_tc_user_id_idx" ON "visits"("tc_user_id");

-- CreateIndex
CREATE INDEX "visits_validation_idx" ON "visits"("validation");

-- CreateIndex
CREATE INDEX "visits_confirmation_status_idx" ON "visits"("confirmation_status");

-- CreateIndex
CREATE INDEX "visits_purpose_idx" ON "visits"("purpose");

-- CreateIndex
CREATE INDEX "visits_started_at_idx" ON "visits"("started_at");

-- CreateIndex
CREATE INDEX "visit_photos_visit_id_idx" ON "visit_photos"("visit_id");

-- CreateIndex
CREATE INDEX "visit_photos_storage_key_idx" ON "visit_photos"("storage_key");

-- CreateIndex
CREATE INDEX "fraud_flags_visit_id_idx" ON "fraud_flags"("visit_id");

-- CreateIndex
CREATE INDEX "fraud_flags_status_idx" ON "fraud_flags"("status");

-- CreateIndex
CREATE INDEX "fraud_flags_severity_idx" ON "fraud_flags"("severity");

-- CreateIndex
CREATE INDEX "fraud_flags_type_idx" ON "fraud_flags"("type");

-- CreateIndex
CREATE INDEX "fraud_flags_detected_at_idx" ON "fraud_flags"("detected_at");

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
