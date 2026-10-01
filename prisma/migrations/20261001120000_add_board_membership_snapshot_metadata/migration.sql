-- AlterTable
ALTER TABLE "JiraBoardMembershipSnapshot" ADD COLUMN "truncated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastRequestedAt" TIMESTAMP(3),
ADD COLUMN "lastStartedAt" TIMESTAMP(3),
ADD COLUMN "lastSuccessAt" TIMESTAMP(3),
ADD COLUMN "lastJobId" TEXT,
ADD COLUMN "refreshReason" TEXT;
