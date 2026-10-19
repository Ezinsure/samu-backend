-- AlterTable
ALTER TABLE "fraud_flags" ADD COLUMN "assigned_reviewer_id" TEXT;

-- CreateIndex
CREATE INDEX "fraud_flags_assigned_reviewer_id_idx" ON "fraud_flags"("assigned_reviewer_id");

-- AddForeignKey
ALTER TABLE "fraud_flags" ADD CONSTRAINT "fraud_flags_assigned_reviewer_id_fkey" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
