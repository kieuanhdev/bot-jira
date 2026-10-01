-- AlterTable
ALTER TABLE "IssueCache" ADD COLUMN "statusId" TEXT;

-- CreateIndex
CREATE INDEX "IssueCache_statusId_idx" ON "IssueCache"("statusId");

-- Backfill from raw JSON where available
UPDATE "IssueCache"
SET "statusId" = "raw"->'status'->>'id'
WHERE "raw"->'status'->>'id' IS NOT NULL;
