/*
  Warnings:

  - Made the column `targetLabel` on table `Release` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "DeliveryState" AS ENUM ('pending', 'sent', 'failed', 'skipped');

-- DropIndex
DROP INDEX "BulkOperation_requestedBy_idx";

-- DropIndex
DROP INDEX "BulkOperation_state_idx";

-- AlterTable
ALTER TABLE "IssueCache" ALTER COLUMN "fixVersionIds" DROP DEFAULT,
ALTER COLUMN "fixVersionNames" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Release" ALTER COLUMN "targetLabel" SET NOT NULL;

-- AlterTable
ALTER TABLE "SentryIssueImported" ALTER COLUMN "importedAt" DROP DEFAULT,
ALTER COLUMN "sentryIssueId" DROP DEFAULT,
ALTER COLUMN "sentryProject" DROP DEFAULT;

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "processingError" TEXT,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "disabledTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deliveryMode" TEXT NOT NULL DEFAULT 'instant',
    "digestHour" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "dedupeKey" TEXT,
    "state" "DeliveryState" NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationEvent_source_receivedAt_idx" ON "IntegrationEvent"("source", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_source_externalId_key" ON "IntegrationEvent"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationOutbox_state_scheduledAt_idx" ON "NotificationOutbox"("state", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationOutbox_userId_idx" ON "NotificationOutbox"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationOutbox_dedupeKey_channel_key" ON "NotificationOutbox"("dedupeKey", "channel");

-- CreateIndex
CREATE INDEX "BulkOperation_state_createdAt_idx" ON "BulkOperation"("state", "createdAt");

-- CreateIndex
CREATE INDEX "BulkOperation_requestedBy_createdAt_idx" ON "BulkOperation"("requestedBy", "createdAt");
