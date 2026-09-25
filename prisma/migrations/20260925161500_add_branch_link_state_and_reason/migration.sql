-- AlterTable
ALTER TABLE "BranchInfo" ADD COLUMN     "linkReason" TEXT,
ADD COLUMN     "linkState" TEXT NOT NULL DEFAULT 'confirmed';

-- CreateIndex
CREATE INDEX "BranchInfo_linkState_idx" ON "BranchInfo"("linkState");
