-- CreateEnum
CREATE TYPE "StockTransferKind" AS ENUM ('assignment', 'return');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('pending', 'accepted', 'partially_accepted', 'declined', 'cancelled');

-- CreateEnum
CREATE TYPE "StockTransferItemDecision" AS ENUM ('pending', 'accepted', 'missing', 'wrong', 'declined');

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "kind" "StockTransferKind" NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'pending',
    "from_user_id" TEXT,
    "to_user_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmed_revision" INTEGER,
    "reason_code" TEXT,
    "note" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "serial_snapshot" TEXT NOT NULL,
    "type_key_snapshot" TEXT NOT NULL,
    "type_label_snapshot" TEXT NOT NULL,
    "condition" TEXT,
    "decision" "StockTransferItemDecision" NOT NULL DEFAULT 'pending',
    "decision_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_events" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "note" TEXT,
    "revision" INTEGER,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_kind_status_idx" ON "stock_transfers"("kind", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_to_user_id_status_idx" ON "stock_transfers"("to_user_id", "status");

-- CreateIndex
CREATE INDEX "stock_transfers_from_user_id_idx" ON "stock_transfers"("from_user_id");

-- CreateIndex
CREATE INDEX "stock_transfers_created_by_user_id_idx" ON "stock_transfers"("created_by_user_id");

-- CreateIndex
CREATE INDEX "stock_transfer_items_unit_id_idx" ON "stock_transfer_items"("unit_id");

-- CreateIndex
CREATE INDEX "stock_transfer_items_decision_idx" ON "stock_transfer_items"("decision");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_unit_id_key" ON "stock_transfer_items"("transfer_id", "unit_id");

-- CreateIndex
CREATE INDEX "stock_transfer_events_transfer_id_created_at_idx" ON "stock_transfer_events"("transfer_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_transfer_events_actor_user_id_idx" ON "stock_transfer_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "stock_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_events" ADD CONSTRAINT "stock_transfer_events_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_events" ADD CONSTRAINT "stock_transfer_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
