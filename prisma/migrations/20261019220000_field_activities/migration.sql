-- CreateEnum
CREATE TYPE "FieldActivityType" AS ENUM ('education', 'demo', 'mobilization', 'support', 'campaign');

-- CreateTable
CREATE TABLE "field_activities" (
    "id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "service_line" "ServiceLine" NOT NULL,
    "activity_type" "FieldActivityType" NOT NULL,
    "date" DATE NOT NULL,
    "geo_province" TEXT NOT NULL,
    "geo_district" TEXT NOT NULL,
    "geo_sector" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "people_reached" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "lead_id" TEXT,
    "agent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "field_activities_tc_user_id_idx" ON "field_activities"("tc_user_id");

-- CreateIndex
CREATE INDEX "field_activities_service_line_idx" ON "field_activities"("service_line");

-- CreateIndex
CREATE INDEX "field_activities_activity_type_idx" ON "field_activities"("activity_type");

-- CreateIndex
CREATE INDEX "field_activities_date_idx" ON "field_activities"("date");

-- CreateIndex
CREATE INDEX "field_activities_geo_district_idx" ON "field_activities"("geo_district");

-- CreateIndex
CREATE INDEX "field_activities_lead_id_idx" ON "field_activities"("lead_id");

-- CreateIndex
CREATE INDEX "field_activities_agent_id_idx" ON "field_activities"("agent_id");

-- AddForeignKey
ALTER TABLE "field_activities" ADD CONSTRAINT "field_activities_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_activities" ADD CONSTRAINT "field_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_activities" ADD CONSTRAINT "field_activities_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
