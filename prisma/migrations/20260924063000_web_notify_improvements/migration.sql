-- AlterTable
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "eventKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "severity" TEXT NOT NULL DEFAULT 'info',
ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMP(3);

-- Backfill eventKey for existing notifications
UPDATE "Notification" SET "eventKey" = id WHERE "eventKey" = '';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_type_eventKey_key" ON "Notification"("userId", "type", "eventKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN IF NOT EXISTS "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pushDisabledTypes" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Update existing outbox rows where lastError is 'no push subscription' to skipped
UPDATE "NotificationOutbox" SET "state" = 'skipped' WHERE "lastError" = 'no push subscription' AND "state" = 'sent';
