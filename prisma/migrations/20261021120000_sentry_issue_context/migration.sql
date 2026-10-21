-- AlterTable
ALTER TABLE "SentryIssueImported" ADD COLUMN "culprit" TEXT,
ADD COLUMN "userCount" INTEGER,
ADD COLUMN "release" TEXT,
ADD COLUMN "environment" TEXT,
ADD COLUMN "enrichedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SentryIssueImported_release_idx" ON "SentryIssueImported"("release");
