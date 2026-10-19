-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('Active', 'Inactive', 'Suspended', 'Pending verification');

-- CreateEnum
CREATE TYPE "ComplianceTone" AS ENUM ('green', 'yellow', 'red');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "nid_masked" TEXT NOT NULL,
    "nid_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" "AgentStatus" NOT NULL DEFAULT 'Active',
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "geo_cell" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "tc_user_id" TEXT NOT NULL,
    "services_json" JSONB NOT NULL,
    "last_visit_at" TIMESTAMP(3),
    "compliance" "ComplianceTone" NOT NULL DEFAULT 'yellow',
    "clients_registered" INTEGER NOT NULL DEFAULT 0,
    "recruited_this_month" BOOLEAN NOT NULL DEFAULT false,
    "reactivated_this_month" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_assignments" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_code_key" ON "agents"("code");

-- CreateIndex
CREATE INDEX "agents_tc_user_id_idx" ON "agents"("tc_user_id");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE INDEX "agents_compliance_idx" ON "agents"("compliance");

-- CreateIndex
CREATE INDEX "agents_geo_province_idx" ON "agents"("geo_province");

-- CreateIndex
CREATE INDEX "agents_geo_district_idx" ON "agents"("geo_district");

-- CreateIndex
CREATE INDEX "agents_name_idx" ON "agents"("name");

-- CreateIndex
CREATE INDEX "agent_assignments_agent_id_idx" ON "agent_assignments"("agent_id");

-- CreateIndex
CREATE INDEX "agent_assignments_tc_user_id_idx" ON "agent_assignments"("tc_user_id");

-- CreateIndex
CREATE INDEX "agent_assignments_active_idx" ON "agent_assignments"("active");

-- AlterTable: make users.agent_id unique for portal link (column already existed nullable)
CREATE UNIQUE INDEX "users_agent_id_key" ON "users"("agent_id");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_assignments" ADD CONSTRAINT "agent_assignments_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
