-- CreateTable
CREATE TABLE "CiBuildStatus" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "testStatus" TEXT,
    "url" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CiBuildStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CiBuildStatus_repo_branch_commitSha_idx" ON "CiBuildStatus"("repo", "branch", "commitSha");

-- CreateIndex
CREATE INDEX "CiBuildStatus_repo_commitSha_idx" ON "CiBuildStatus"("repo", "commitSha");

-- CreateIndex
CREATE UNIQUE INDEX "CiBuildStatus_provider_externalId_key" ON "CiBuildStatus"("provider", "externalId");
