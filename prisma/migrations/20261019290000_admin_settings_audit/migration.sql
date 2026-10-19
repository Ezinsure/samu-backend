-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('stub_queued', 'stub_sent', 'stub_failed');

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "gps_distance_meters" INTEGER NOT NULL DEFAULT 10,
    "agent_green_days" INTEGER NOT NULL DEFAULT 60,
    "agent_yellow_days" INTEGER NOT NULL DEFAULT 30,
    "tc_compliance_green" INTEGER NOT NULL DEFAULT 90,
    "tc_compliance_yellow" INTEGER NOT NULL DEFAULT 70,
    "monthly_report_due_day" INTEGER NOT NULL DEFAULT 5,
    "kpi_targets_json" JSONB NOT NULL,
    "sms_templates_json" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_user_id" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_outbox" (
    "id" TEXT NOT NULL,
    "to_phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "template_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'stub_queued',
    "visit_id" TEXT,
    "agent_id" TEXT,
    "created_by_id" TEXT,
    "provider_ref" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_object_type_idx" ON "audit_logs"("object_type");

-- CreateIndex
CREATE INDEX "audit_logs_object_id_idx" ON "audit_logs"("object_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "message_outbox_status_idx" ON "message_outbox"("status");

-- CreateIndex
CREATE INDEX "message_outbox_to_phone_idx" ON "message_outbox"("to_phone");

-- CreateIndex
CREATE INDEX "message_outbox_created_at_idx" ON "message_outbox"("created_at");

-- CreateIndex
CREATE INDEX "message_outbox_visit_id_idx" ON "message_outbox"("visit_id");

-- CreateIndex
CREATE INDEX "message_outbox_agent_id_idx" ON "message_outbox"("agent_id");

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_outbox" ADD CONSTRAINT "message_outbox_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
