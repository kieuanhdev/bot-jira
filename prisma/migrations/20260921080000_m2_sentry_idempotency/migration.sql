-- Redefine table: change SentryIssueImported from old schema to new schema
DROP INDEX IF EXISTS "SentryIssueImported_sentryId_key";

ALTER TABLE "SentryIssueImported" DROP CONSTRAINT IF EXISTS "SentryIssueImported_jiraKey_fkey";

ALTER TABLE "SentryIssueImported" DROP COLUMN IF EXISTS "sentryId";

ALTER TABLE "SentryIssueImported" ALTER COLUMN "jiraKey" DROP NOT NULL;

ALTER TABLE "SentryIssueImported" ALTER COLUMN "importedAt" DROP NOT NULL;

CREATE TYPE "ImportState" AS ENUM ('pending', 'created', 'failed', 'ignored');

ALTER TABLE "SentryIssueImported" ADD COLUMN "sentryIssueId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SentryIssueImported" ADD COLUMN "sentryProject" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SentryIssueImported" ADD COLUMN "state" "ImportState" NOT NULL DEFAULT 'pending';
ALTER TABLE "SentryIssueImported" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SentryIssueImported" ADD COLUMN "lastError" TEXT;
ALTER TABLE "SentryIssueImported" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "SentryIssueImported" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SentryIssueImported" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;

CREATE UNIQUE INDEX "SentryIssueImported_sentryProject_sentryIssueId_key" ON "SentryIssueImported"("sentryProject", "sentryIssueId");

CREATE INDEX "SentryIssueImported_state_lastAttemptAt_idx" ON "SentryIssueImported"("state", "lastAttemptAt");
