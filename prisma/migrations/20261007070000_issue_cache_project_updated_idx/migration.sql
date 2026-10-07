-- Serves list/stale/filter queries: projectKey IN (...) AND deletedAt IS NULL ORDER BY updatedAt.
CREATE INDEX "IssueCache_projectKey_deletedAt_updatedAt_idx" ON "IssueCache"("projectKey", "deletedAt", "updatedAt");
