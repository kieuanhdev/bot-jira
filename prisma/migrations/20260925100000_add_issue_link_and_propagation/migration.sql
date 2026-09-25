-- CreateTable
CREATE TABLE IF NOT EXISTS "IssueLinkCache" (
    "id" TEXT NOT NULL,
    "jiraLinkId" TEXT NOT NULL,
    "linkTypeId" TEXT NOT NULL,
    "linkTypeName" TEXT NOT NULL,
    "inwardLabel" TEXT NOT NULL,
    "outwardLabel" TEXT NOT NULL,
    "outwardKey" TEXT NOT NULL,
    "inwardKey" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "IssueLinkCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FixVersionPropagation" (
    "id" TEXT NOT NULL,
    "rootKey" TEXT NOT NULL,
    "dependencyKey" TEXT NOT NULL,
    "jiraVersionId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "operationId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "FixVersionPropagation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "IssueLinkCache_jiraLinkId_key" ON "IssueLinkCache"("jiraLinkId");
CREATE INDEX IF NOT EXISTS "IssueLinkCache_outwardKey_deletedAt_idx" ON "IssueLinkCache"("outwardKey", "deletedAt");
CREATE INDEX IF NOT EXISTS "IssueLinkCache_inwardKey_deletedAt_idx" ON "IssueLinkCache"("inwardKey", "deletedAt");
CREATE INDEX IF NOT EXISTS "IssueLinkCache_linkTypeId_deletedAt_idx" ON "IssueLinkCache"("linkTypeId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FixVersionPropagation_rootKey_dependencyKey_jiraVersionId_key" ON "FixVersionPropagation"("rootKey", "dependencyKey", "jiraVersionId");
CREATE INDEX IF NOT EXISTS "FixVersionPropagation_dependencyKey_jiraVersionId_active_idx" ON "FixVersionPropagation"("dependencyKey", "jiraVersionId", "active");
CREATE INDEX IF NOT EXISTS "FixVersionPropagation_rootKey_jiraVersionId_active_idx" ON "FixVersionPropagation"("rootKey", "jiraVersionId", "active");
