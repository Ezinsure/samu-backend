-- CreateEnum
CREATE TYPE "TerritoryType" AS ENUM ('province', 'district', 'sector', 'cell');

-- CreateTable
CREATE TABLE "territories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TerritoryType" NOT NULL,
    "parent_id" TEXT,
    "active_tc_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "territories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "territory_assignments" (
    "id" TEXT NOT NULL,
    "territory_id" TEXT NOT NULL,
    "tc_user_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "territories_parent_id_idx" ON "territories"("parent_id");

-- CreateIndex
CREATE INDEX "territories_type_idx" ON "territories"("type");

-- CreateIndex
CREATE INDEX "territories_active_tc_user_id_idx" ON "territories"("active_tc_user_id");

-- CreateIndex
CREATE INDEX "territory_assignments_territory_id_idx" ON "territory_assignments"("territory_id");

-- CreateIndex
CREATE INDEX "territory_assignments_tc_user_id_idx" ON "territory_assignments"("tc_user_id");

-- CreateIndex
CREATE INDEX "territory_assignments_active_idx" ON "territory_assignments"("active");

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "territories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territories" ADD CONSTRAINT "territories_active_tc_user_id_fkey" FOREIGN KEY ("active_tc_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_assignments" ADD CONSTRAINT "territory_assignments_territory_id_fkey" FOREIGN KEY ("territory_id") REFERENCES "territories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "territory_assignments" ADD CONSTRAINT "territory_assignments_tc_user_id_fkey" FOREIGN KEY ("tc_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
