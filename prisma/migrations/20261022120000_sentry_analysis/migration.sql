-- CreateEnum
CREATE TYPE "SentryAnalysisState" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "SentryAnalysis" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "state" "SentryAnalysisState" NOT NULL DEFAULT 'pending',
    "result" JSONB,
    "error" TEXT,
    "release" TEXT,
    "gitRef" TEXT,
    "requestedBy" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentryAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentryAnalysis_importId_key" ON "SentryAnalysis"("importId");

-- CreateIndex
CREATE INDEX "SentryAnalysis_state_requestedAt_idx" ON "SentryAnalysis"("state", "requestedAt");

-- AddForeignKey
ALTER TABLE "SentryAnalysis" ADD CONSTRAINT "SentryAnalysis_importId_fkey" FOREIGN KEY ("importId") REFERENCES "SentryIssueImported"("id") ON DELETE CASCADE ON UPDATE CASCADE;
