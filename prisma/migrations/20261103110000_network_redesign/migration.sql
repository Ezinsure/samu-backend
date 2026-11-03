-- Network redesign: lifecycle statuses, profile fields, invite links, training, support

-- Replace AgentStatus enum
CREATE TYPE "AgentStatus_new" AS ENUM ('Candidate', 'InTraining', 'ExamPending', 'Certified', 'Inactive');

ALTER TABLE "agents" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "agents"
  ALTER COLUMN "status" TYPE "AgentStatus_new"
  USING (
    CASE "status"::text
      WHEN 'Active' THEN 'Certified'::"AgentStatus_new"
      WHEN 'Inactive' THEN 'Inactive'::"AgentStatus_new"
      WHEN 'Suspended' THEN 'Inactive'::"AgentStatus_new"
      WHEN 'Pending verification' THEN 'Candidate'::"AgentStatus_new"
      ELSE 'Certified'::"AgentStatus_new"
    END
  );

DROP TYPE "AgentStatus";
ALTER TYPE "AgentStatus_new" RENAME TO "AgentStatus";

ALTER TABLE "agents" ALTER COLUMN "status" SET DEFAULT 'Candidate'::"AgentStatus";

CREATE TYPE "OfficeType" AS ENUM ('kiosk', 'room', 'desk');
CREATE TYPE "ReviewStatus" AS ENUM ('pending_review', 'accepted', 'rejected');
CREATE TYPE "SupportChannel" AS ENUM ('phone', 'whatsapp', 'in_person', 'other');

-- Make tc_user_id nullable
ALTER TABLE "agents" ALTER COLUMN "tc_user_id" DROP NOT NULL;

ALTER TABLE "agents"
  ADD COLUMN IF NOT EXISTS "review_status" "ReviewStatus" NOT NULL DEFAULT 'accepted',
  ADD COLUMN IF NOT EXISTS "age" INTEGER,
  ADD COLUMN IF NOT EXISTS "gender" TEXT,
  ADD COLUMN IF NOT EXISTS "education" TEXT,
  ADD COLUMN IF NOT EXISTS "tin" TEXT,
  ADD COLUMN IF NOT EXISTS "business_type" TEXT,
  ADD COLUMN IF NOT EXISTS "venue" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_contact_name" TEXT,
  ADD COLUMN IF NOT EXISTS "emergency_contact_phone" TEXT,
  ADD COLUMN IF NOT EXISTS "criminal_record_bill_id" TEXT,
  ADD COLUMN IF NOT EXISTS "certificate_storage_key" TEXT,
  ADD COLUMN IF NOT EXISTS "has_printer_scanner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "has_computer" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "office_type" "OfficeType",
  ADD COLUMN IF NOT EXISTS "building" TEXT,
  ADD COLUMN IF NOT EXISTS "geo_village" TEXT,
  ADD COLUMN IF NOT EXISTS "recruited_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "exam_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "irembo_account_created_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "agents_recruited_by_user_id_idx" ON "agents"("recruited_by_user_id");
CREATE INDEX IF NOT EXISTS "agents_review_status_idx" ON "agents"("review_status");

ALTER TABLE "agents"
  ADD CONSTRAINT "agents_recruited_by_user_id_fkey"
  FOREIGN KEY ("recruited_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "invite_links" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invite_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invite_links_token_key" ON "invite_links"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "invite_links_owner_user_id_key" ON "invite_links"("owner_user_id");
CREATE INDEX IF NOT EXISTS "invite_links_token_idx" ON "invite_links"("token");

ALTER TABLE "invite_links"
  ADD CONSTRAINT "invite_links_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "training_sessions" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "session_date" DATE NOT NULL,
  "uploaded_by_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_sessions_session_date_idx" ON "training_sessions"("session_date");

ALTER TABLE "training_sessions"
  ADD CONSTRAINT "training_sessions_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "training_attendance" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "agent_id" TEXT,
  "email" TEXT NOT NULL,
  "attended" BOOLEAN NOT NULL DEFAULT true,
  "follow_up_note" TEXT,
  CONSTRAINT "training_attendance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "training_attendance_session_id_idx" ON "training_attendance"("session_id");
CREATE INDEX IF NOT EXISTS "training_attendance_agent_id_idx" ON "training_attendance"("agent_id");
CREATE INDEX IF NOT EXISTS "training_attendance_email_idx" ON "training_attendance"("email");

ALTER TABLE "training_attendance"
  ADD CONSTRAINT "training_attendance_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "training_attendance"
  ADD CONSTRAINT "training_attendance_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "support_logs" (
  "id" TEXT NOT NULL,
  "tc_user_id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "supported_at" TIMESTAMP(3) NOT NULL,
  "channel" "SupportChannel" NOT NULL DEFAULT 'phone',
  "summary" TEXT NOT NULL,
  "outcome" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_logs_tc_user_id_idx" ON "support_logs"("tc_user_id");
CREATE INDEX IF NOT EXISTS "support_logs_agent_id_idx" ON "support_logs"("agent_id");
CREATE INDEX IF NOT EXISTS "support_logs_supported_at_idx" ON "support_logs"("supported_at");

ALTER TABLE "support_logs"
  ADD CONSTRAINT "support_logs_tc_user_id_fkey"
  FOREIGN KEY ("tc_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_logs"
  ADD CONSTRAINT "support_logs_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "agents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
