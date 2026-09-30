-- CreateTable
CREATE TABLE "BulkCreateItem" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "clientRef" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requested" JSONB NOT NULL,
    "jiraKey" TEXT,
    "jiraIssueId" TEXT,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "error" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulkCreateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulkCreateItem_idempotencyKey_key" ON "BulkCreateItem"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BulkCreateItem_operationId_status_idx" ON "BulkCreateItem"("operationId", "status");

-- CreateIndex
CREATE INDEX "BulkCreateItem_jiraKey_idx" ON "BulkCreateItem"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "BulkCreateItem_operationId_clientRef_key" ON "BulkCreateItem"("operationId", "clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "BulkCreateItem_operationId_rowIndex_key" ON "BulkCreateItem"("operationId", "rowIndex");

-- AddForeignKey
ALTER TABLE "BulkCreateItem" ADD CONSTRAINT "BulkCreateItem_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "BulkOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
