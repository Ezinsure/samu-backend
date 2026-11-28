-- CreateEnum
CREATE TYPE "StockTrackingMode" AS ENUM ('serialized', 'quantity');

-- CreateEnum
CREATE TYPE "StockBalanceMovementKind" AS ENUM ('intake', 'assign', 'accept', 'decline', 'return', 'sell', 'adjust');

-- AlterTable
ALTER TABLE "stock_item_types" ADD COLUMN "tracking_mode" "StockTrackingMode" NOT NULL DEFAULT 'serialized';

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN "type_id" TEXT,
ADD COLUMN "quantity" INTEGER;

-- CreateTable
CREATE TABLE "stock_intake_batch_lines" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_intake_batch_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balances" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "holder_user_id" TEXT,
    "scope_key" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_balance_movements" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "kind" "StockBalanceMovementKind" NOT NULL,
    "from_holder_id" TEXT,
    "to_holder_id" TEXT,
    "serial_bound" TEXT,
    "unit_id" TEXT,
    "reason_code" TEXT,
    "note" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balance_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_intake_batch_lines_batch_id_idx" ON "stock_intake_batch_lines"("batch_id");

-- CreateIndex
CREATE INDEX "stock_intake_batch_lines_type_id_idx" ON "stock_intake_batch_lines"("type_id");

-- CreateIndex
CREATE INDEX "stock_balances_holder_user_id_idx" ON "stock_balances"("holder_user_id");

-- CreateIndex
CREATE INDEX "stock_balances_type_id_idx" ON "stock_balances"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_balances_type_id_scope_key_key" ON "stock_balances"("type_id", "scope_key");

-- CreateIndex
CREATE INDEX "stock_balance_movements_type_id_created_at_idx" ON "stock_balance_movements"("type_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_balance_movements_kind_idx" ON "stock_balance_movements"("kind");

-- CreateIndex
CREATE INDEX "stock_balance_movements_actor_user_id_idx" ON "stock_balance_movements"("actor_user_id");

-- CreateIndex
CREATE INDEX "stock_balance_movements_ref_type_ref_id_idx" ON "stock_balance_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "stock_balance_movements_unit_id_idx" ON "stock_balance_movements"("unit_id");

-- CreateIndex
CREATE INDEX "stock_item_types_tracking_mode_idx" ON "stock_item_types"("tracking_mode");

-- CreateIndex
CREATE INDEX "stock_transfers_type_id_idx" ON "stock_transfers"("type_id");

-- AddForeignKey
ALTER TABLE "stock_intake_batch_lines" ADD CONSTRAINT "stock_intake_batch_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_intake_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_intake_batch_lines" ADD CONSTRAINT "stock_intake_batch_lines_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_holder_user_id_fkey" FOREIGN KEY ("holder_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance_movements" ADD CONSTRAINT "stock_balance_movements_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance_movements" ADD CONSTRAINT "stock_balance_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_balance_movements" ADD CONSTRAINT "stock_balance_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "stock_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed: mark 4G SIM as quantity-tracked
UPDATE "stock_item_types"
SET "tracking_mode" = 'quantity',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'sim_4g';
