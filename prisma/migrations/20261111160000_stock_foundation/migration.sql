-- CreateEnum
CREATE TYPE "StockUnitStatus" AS ENUM ('in_warehouse', 'in_transit', 'with_holder', 'sold', 'returned_by_customer', 'damaged', 'written_off');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('intake', 'assign', 'accept', 'decline', 'sale', 'customer_return', 'return_to_office', 'confirm_return', 'adjust', 'write_off');

-- CreateTable
CREATE TABLE "stock_item_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "attributes_schema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_item_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_units" (
    "id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" "StockUnitStatus" NOT NULL DEFAULT 'in_warehouse',
    "holder_user_id" TEXT,
    "attributes" JSONB,
    "condition" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "from_holder_id" TEXT,
    "to_holder_id" TEXT,
    "reason_code" TEXT,
    "note" TEXT,
    "ref_type" TEXT,
    "ref_id" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_item_types_key_key" ON "stock_item_types"("key");

-- CreateIndex
CREATE INDEX "stock_item_types_enabled_idx" ON "stock_item_types"("enabled");

-- CreateIndex
CREATE INDEX "stock_item_types_sort_order_idx" ON "stock_item_types"("sort_order");

-- CreateIndex
CREATE INDEX "stock_units_status_idx" ON "stock_units"("status");

-- CreateIndex
CREATE INDEX "stock_units_holder_user_id_idx" ON "stock_units"("holder_user_id");

-- CreateIndex
CREATE INDEX "stock_units_serial_idx" ON "stock_units"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "stock_units_type_id_serial_key" ON "stock_units"("type_id", "serial");

-- CreateIndex
CREATE INDEX "stock_movements_unit_id_created_at_idx" ON "stock_movements"("unit_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_type_idx" ON "stock_movements"("type");

-- CreateIndex
CREATE INDEX "stock_movements_actor_user_id_idx" ON "stock_movements"("actor_user_id");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- AddForeignKey
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_holder_user_id_fkey" FOREIGN KEY ("holder_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "stock_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
