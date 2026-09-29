-- AlterTable
ALTER TABLE "Release" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Release" ADD COLUMN "jiraUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Release_archived_idx" ON "Release"("archived");

-- Backfill status per §8.2: checking, ready, blocked, unknown -> draft
UPDATE "Release" SET "status" = 'draft' WHERE "status" IN ('checking', 'ready', 'blocked', 'unknown');
