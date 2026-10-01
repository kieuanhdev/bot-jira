-- CreateTable
CREATE TABLE "JiraBoardMembershipSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "generation" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "backlogCount" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "staleUntil" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraBoardMembershipSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraBoardMembershipEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "generation" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "isBacklog" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JiraBoardMembershipEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JiraBoardMembershipSnapshot_state_expiresAt_idx" ON "JiraBoardMembershipSnapshot"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "JiraBoardMembershipSnapshot_userId_projectKey_boardId_key" ON "JiraBoardMembershipSnapshot"("userId", "projectKey", "boardId");

-- CreateIndex
CREATE INDEX "JiraBoardMembershipEntry_snapshotId_generation_isBacklog_idx" ON "JiraBoardMembershipEntry"("snapshotId", "generation", "isBacklog");

-- CreateIndex
CREATE INDEX "JiraBoardMembershipEntry_jiraKey_idx" ON "JiraBoardMembershipEntry"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "JiraBoardMembershipEntry_snapshotId_generation_jiraKey_key" ON "JiraBoardMembershipEntry"("snapshotId", "generation", "jiraKey");

-- AddForeignKey
ALTER TABLE "JiraBoardMembershipSnapshot" ADD CONSTRAINT "JiraBoardMembershipSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JiraBoardMembershipEntry" ADD CONSTRAINT "JiraBoardMembershipEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "JiraBoardMembershipSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
