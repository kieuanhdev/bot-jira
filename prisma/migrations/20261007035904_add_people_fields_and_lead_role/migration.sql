-- CreateEnum
CREATE TYPE "PeopleRole" AS ENUM ('reporter', 'approver', 'tester');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'lead';

-- AlterTable
ALTER TABLE "IssueCache" ADD COLUMN     "approverJira" TEXT,
ADD COLUMN     "epicKey" TEXT,
ADD COLUMN     "reporterJira" TEXT,
ADD COLUMN     "testerJira" TEXT;

-- CreateTable
CREATE TABLE "IssueTransitionEvent" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "fromStatusGroup" TEXT,
    "toStatusGroup" TEXT NOT NULL,
    "assigneeJira" TEXT,
    "source" TEXT NOT NULL DEFAULT 'jira_webhook',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueTransitionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPeopleField" (
    "projectKey" TEXT NOT NULL,
    "role" "PeopleRole" NOT NULL,
    "jiraFieldId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPeopleField_pkey" PRIMARY KEY ("projectKey","role")
);

-- CreateIndex
CREATE UNIQUE INDEX "IssueTransitionEvent_eventKey_key" ON "IssueTransitionEvent"("eventKey");

-- CreateIndex
CREATE INDEX "IssueTransitionEvent_projectKey_occurredAt_idx" ON "IssueTransitionEvent"("projectKey", "occurredAt");

-- CreateIndex
CREATE INDEX "IssueTransitionEvent_jiraKey_occurredAt_idx" ON "IssueTransitionEvent"("jiraKey", "occurredAt");

-- CreateIndex
CREATE INDEX "IssueTransitionEvent_assigneeJira_occurredAt_idx" ON "IssueTransitionEvent"("assigneeJira", "occurredAt");

-- CreateIndex
CREATE INDEX "ProjectPeopleField_projectKey_idx" ON "ProjectPeopleField"("projectKey");

-- CreateIndex
CREATE INDEX "IssueCache_reporterJira_idx" ON "IssueCache"("reporterJira");

-- CreateIndex
CREATE INDEX "IssueCache_approverJira_idx" ON "IssueCache"("approverJira");

-- CreateIndex
CREATE INDEX "IssueCache_testerJira_idx" ON "IssueCache"("testerJira");

-- CreateIndex
CREATE INDEX "IssueCache_epicKey_idx" ON "IssueCache"("epicKey");
