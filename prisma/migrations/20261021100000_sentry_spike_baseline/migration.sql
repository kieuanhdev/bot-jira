-- AlterTable
ALTER TABLE "SentryIssueImported" ADD COLUMN "countBaseline" INTEGER,
ADD COLUMN "countBaselineAt" TIMESTAMP(3);
