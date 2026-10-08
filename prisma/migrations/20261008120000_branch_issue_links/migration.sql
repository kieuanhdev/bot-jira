-- Many-to-many links between branches and Jira tasks.
CREATE TABLE "BranchIssueLink" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "linkSource" TEXT,
    "linkConfidence" INTEGER,
    "linkState" TEXT NOT NULL DEFAULT 'confirmed',
    "linkReason" TEXT,
    "linkReviewedAt" TIMESTAMP(3),
    "linkReviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchIssueLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchIssueLink_branchId_jiraKey_key" ON "BranchIssueLink"("branchId", "jiraKey");
CREATE INDEX "BranchIssueLink_jiraKey_linkState_idx" ON "BranchIssueLink"("jiraKey", "linkState");
CREATE INDEX "BranchIssueLink_branchId_idx" ON "BranchIssueLink"("branchId");

ALTER TABLE "BranchIssueLink" ADD CONSTRAINT "BranchIssueLink_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "BranchInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchIssueLink" ADD CONSTRAINT "BranchIssueLink_jiraKey_fkey"
  FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every currently linked branch becomes one link row.
INSERT INTO "BranchIssueLink" ("id", "branchId", "jiraKey", "linkSource", "linkConfidence", "linkState", "linkReason", "linkReviewedAt", "linkReviewedById", "updatedAt")
SELECT 'bil_' || b."id", b."id", b."jiraKey", b."linkSource", b."linkConfidence", 'confirmed', b."linkReason", b."linkReviewedAt", b."linkReviewedById", CURRENT_TIMESTAMP
FROM "BranchInfo" b
WHERE b."jiraKey" IS NOT NULL
  AND b."linkState" NOT IN ('rejected', 'manual_unlinked');
