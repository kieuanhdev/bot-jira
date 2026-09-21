-- M4: bulk operations + per-item audit, branch/issue linkage.

-- New enum for bulk operation lifecycle.
CREATE TYPE "OperationState" AS ENUM ('preview', 'queued', 'running', 'completed', 'partially_failed', 'failed', 'cancelled');

-- Operation header: who, what, how far it has gotten.
CREATE TABLE "BulkOperation" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "state" "OperationState" NOT NULL DEFAULT 'preview',
    "total" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkOperation_pkey" PRIMARY KEY ("id")
);

-- One row per targeted issue. Carries before/after snapshot for the audit trail
-- and a retry flag for retryable transient failures.
CREATE TABLE "BulkOperationItem" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "before" JSONB,
    "requested" JSONB NOT NULL,
    "after" JSONB,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BulkOperationItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BulkOperationItem_operationId_jiraKey_key" UNIQUE ("operationId", "jiraKey")
);

-- Link a BranchInfo row to the Jira issue it was created from (M4-05).
ALTER TABLE "BranchInfo" ADD COLUMN "jiraKey" TEXT;

CREATE INDEX "BulkOperation_state_idx" ON "BulkOperation"("state");
CREATE INDEX "BulkOperation_requestedBy_idx" ON "BulkOperation"("requestedBy");
CREATE INDEX "BulkOperationItem_operationId_status_idx" ON "BulkOperationItem"("operationId", "status");
CREATE INDEX "BranchInfo_jiraKey_idx" ON "BranchInfo"("jiraKey");

-- FKs
ALTER TABLE "BulkOperationItem" ADD CONSTRAINT "BulkOperationItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "BulkOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
