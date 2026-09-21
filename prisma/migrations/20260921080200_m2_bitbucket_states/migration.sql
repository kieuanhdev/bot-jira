-- Add PR state and destination branch tracking to BranchInfo
ALTER TABLE "BranchInfo" ADD COLUMN "prState" TEXT;
ALTER TABLE "BranchInfo" ADD COLUMN "prDestinationBranch" TEXT;
