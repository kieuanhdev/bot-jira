-- CreateTable
CREATE TABLE "ProjectReportSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "jiraVersionId" TEXT NOT NULL DEFAULT '',
    "versionName" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL,
    "statusGroups" JSONB NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "doneCount" INTEGER NOT NULL,
    "totalPoints" INTEGER,
    "donePoints" INTEGER,
    "totalEstimateSeconds" INTEGER,
    "doneEstimateSeconds" INTEGER,
    "blockedCount" INTEGER NOT NULL,
    "overdueCount" INTEGER NOT NULL,
    "overSlaCount" INTEGER NOT NULL,
    "unassignedCount" INTEGER NOT NULL,
    "sourceLastSyncedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectReportSnapshot_projectKey_jiraVersionId_snapshotDate_idx" ON "ProjectReportSnapshot"("projectKey", "jiraVersionId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectReportSnapshot_snapshotDate_projectKey_jiraVersionId_key" ON "ProjectReportSnapshot"("snapshotDate", "projectKey", "jiraVersionId");
