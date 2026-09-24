-- AlterTable
ALTER TABLE "BranchInfo" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "latestCommitSha" TEXT,
ADD COLUMN     "linkConfidence" INTEGER,
ADD COLUMN     "linkReviewedAt" TIMESTAMP(3),
ADD COLUMN     "linkReviewedById" TEXT,
ADD COLUMN     "linkSource" TEXT,
ADD COLUMN     "prTitle" TEXT,
ADD COLUMN     "prUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "suggestedJiraKey" TEXT;

-- CreateIndex
CREATE INDEX "BranchInfo_deletedAt_checkedAt_idx" ON "BranchInfo"("deletedAt", "checkedAt");

-- CreateIndex
CREATE INDEX "BranchInfo_prState_merged_idx" ON "BranchInfo"("prState", "merged");

-- CreateIndex
CREATE INDEX "BranchInfo_suggestedJiraKey_idx" ON "BranchInfo"("suggestedJiraKey");

-- AddForeignKey
ALTER TABLE "BranchInfo" ADD CONSTRAINT "BranchInfo_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE SET NULL ON UPDATE CASCADE;
