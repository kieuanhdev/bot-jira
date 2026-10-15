-- AlterEnum
ALTER TYPE "ImportState" ADD VALUE 'review';
ALTER TYPE "ImportState" ADD VALUE 'approved';
ALTER TYPE "ImportState" ADD VALUE 'rejected';

-- AlterTable
ALTER TABLE "SentryIssueImported" ADD COLUMN "shortId" TEXT,
ADD COLUMN "title" TEXT,
ADD COLUMN "level" TEXT,
ADD COLUMN "permalinkUrl" TEXT,
ADD COLUMN "eventCount" INTEGER,
ADD COLUMN "firstSeen" TIMESTAMP(3),
ADD COLUMN "lastSeen" TIMESTAMP(3),
ADD COLUMN "targetProject" TEXT,
ADD COLUMN "reviewedBy" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);
