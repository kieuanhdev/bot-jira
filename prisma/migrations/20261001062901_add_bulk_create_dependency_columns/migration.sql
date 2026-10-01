-- AlterTable
ALTER TABLE "BulkCreateItem" ADD COLUMN     "depth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentClientRef" TEXT,
ADD COLUMN     "parentJiraKey" TEXT,
ADD COLUMN     "resolvedParentJiraKey" TEXT;

-- CreateIndex
CREATE INDEX "BulkCreateItem_operationId_parentClientRef_idx" ON "BulkCreateItem"("operationId", "parentClientRef");

-- CreateIndex
CREATE INDEX "BulkCreateItem_operationId_parentJiraKey_idx" ON "BulkCreateItem"("operationId", "parentJiraKey");
