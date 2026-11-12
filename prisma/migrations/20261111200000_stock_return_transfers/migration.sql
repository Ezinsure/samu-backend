-- AlterEnum
ALTER TYPE "StockTransferStatus" ADD VALUE 'draft';

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN "holder_confirmed_revision" INTEGER,
ADD COLUMN "office_confirmed_revision" INTEGER;
