-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bitbucketTokenEnc" TEXT,
ADD COLUMN     "bitbucketUserEnc" TEXT,
ADD COLUMN     "bitbucketVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "jiraAuth" TEXT,
ADD COLUMN     "jiraTokenEnc" TEXT,
ADD COLUMN     "jiraUserEnc" TEXT,
ADD COLUMN     "jiraVerifiedAt" TIMESTAMP(3);
