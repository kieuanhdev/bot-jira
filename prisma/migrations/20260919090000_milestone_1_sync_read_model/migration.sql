-- Milestone 1: make IssueCache the shared read model and add durable sync state.

-- AlterTable
ALTER TABLE "IssueCache"
ADD COLUMN "projectKey" TEXT NOT NULL DEFAULT '',
ADD COLUMN "statusCategory" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "statusChangedAt" TIMESTAMP(3),
ADD COLUMN "fixVersionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "fixVersionNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Backfill project keys from standard Jira issue keys.
UPDATE "IssueCache"
SET "projectKey" = split_part("jiraKey", '-', 1)
WHERE "projectKey" = '' AND position('-' in "jiraKey") > 1;

-- AlterTable
ALTER TABLE "CommentCache"
ADD COLUMN "jiraCommentId" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Jira comment ids are the durable identity. The previous content-based key
-- rejected valid repeated comments and cannot represent comment edits.
DROP INDEX "CommentCache_jiraKey_author_body_key";

-- CreateTable
CREATE TABLE "IntegrationCursor" (
    "id" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "cursor" TEXT,
    "lastStartedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueCache_projectKey_idx" ON "IssueCache"("projectKey");
CREATE INDEX "IssueCache_statusCategory_idx" ON "IssueCache"("statusCategory");
CREATE INDEX "IssueCache_lastSyncedAt_idx" ON "IssueCache"("lastSyncedAt");
CREATE UNIQUE INDEX "CommentCache_jiraCommentId_key" ON "CommentCache"("jiraCommentId");
CREATE UNIQUE INDEX "IntegrationCursor_integration_scope_key" ON "IntegrationCursor"("integration", "scope");
CREATE INDEX "IntegrationCursor_integration_lastSuccessAt_idx" ON "IntegrationCursor"("integration", "lastSuccessAt");
