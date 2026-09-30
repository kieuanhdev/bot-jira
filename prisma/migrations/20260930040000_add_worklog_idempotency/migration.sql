-- CreateTable
CREATE TABLE "WorklogIdempotency" (
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "jiraWorklogId" TEXT,
    "timeSpentSeconds" INTEGER,
    "response" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorklogIdempotency_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "WorklogIdempotency_jiraKey_createdAt_idx" ON "WorklogIdempotency"("jiraKey", "createdAt");

-- CreateIndex
CREATE INDEX "WorklogIdempotency_userId_createdAt_idx" ON "WorklogIdempotency"("userId", "createdAt");
