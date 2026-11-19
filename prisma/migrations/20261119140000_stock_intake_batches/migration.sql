-- CreateTable
CREATE TABLE "stock_intake_batches" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "supplier_ref" TEXT,
    "note" TEXT,
    "type_id" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_intake_batches_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "stock_units" ADD COLUMN "intake_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "stock_intake_batches_received_at_idx" ON "stock_intake_batches"("received_at");

-- CreateIndex
CREATE INDEX "stock_intake_batches_type_id_idx" ON "stock_intake_batches"("type_id");

-- CreateIndex
CREATE INDEX "stock_intake_batches_created_by_user_id_idx" ON "stock_intake_batches"("created_by_user_id");

-- CreateIndex
CREATE INDEX "stock_units_intake_batch_id_idx" ON "stock_units"("intake_batch_id");

-- AddForeignKey
ALTER TABLE "stock_intake_batches" ADD CONSTRAINT "stock_intake_batches_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "stock_item_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_intake_batches" ADD CONSTRAINT "stock_intake_batches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_units" ADD CONSTRAINT "stock_units_intake_batch_id_fkey" FOREIGN KEY ("intake_batch_id") REFERENCES "stock_intake_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
