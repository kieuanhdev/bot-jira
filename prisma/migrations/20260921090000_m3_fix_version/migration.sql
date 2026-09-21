-- M3-01: Use Jira Fix Version as the release identity (CUR-09 fix).
--
-- The Release model was previously identified by a unique targetLabel, which
-- was a P1 bug: Jira is the source of truth for versions and a free-form
-- label is not a stable release identity. New releases are identified by the
-- pair (projectKey, jiraVersionId). The old targetLabel is kept for backward
-- compatibility (made optional, defaulted to '') but is no longer unique.

-- Add the new Jira Fix Version identity columns.
ALTER TABLE "Release" ADD COLUMN "projectKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Release" ADD COLUMN "jiraVersionId" TEXT;
ALTER TABLE "Release" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Release" ADD COLUMN "releaseDate" TIMESTAMP(3);
ALTER TABLE "Release" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Release" ADD COLUMN "releasedAt" TIMESTAMP(3);

-- Backward compatibility: existing rows all have distinct non-empty
-- targetLabel, so making the column optional (default '') and dropping its
-- unique index does not violate any existing data.
ALTER TABLE "Release" ALTER COLUMN "targetLabel" DROP NOT NULL;
ALTER TABLE "Release" ALTER COLUMN "targetLabel" SET DEFAULT '';
DROP INDEX "Release_targetLabel_key";

-- Identity for Jira-version releases. A partial unique index keeps the
-- constraint meaningful while allowing multiple legacy label-based releases
-- (jiraVersionId IS NULL), which are not part of this identity.
CREATE UNIQUE INDEX "Release_projectKey_jiraVersionId_key"
    ON "Release"("projectKey", "jiraVersionId")
    WHERE "jiraVersionId" IS NOT NULL;

-- Lookups are scoped by project.
CREATE INDEX "Release_projectKey_idx" ON "Release"("projectKey");
