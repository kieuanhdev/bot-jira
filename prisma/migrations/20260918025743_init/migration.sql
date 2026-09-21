-- CreateEnum
CREATE TYPE "Role" AS ENUM ('member', 'admin');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('draft', 'ready', 'blocked', 'released');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "jiraUsername" TEXT,
    "role" "Role" NOT NULL DEFAULT 'member',
    "pushSubscription" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueCache" (
    "jiraKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "assigneeJira" TEXT,
    "labels" TEXT[],
    "priority" TEXT NOT NULL DEFAULT '',
    "points" INTEGER,
    "storyField" TEXT,
    "type" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "IssueCache_pkey" PRIMARY KEY ("jiraKey")
);

-- CreateTable
CREATE TABLE "CommentCache" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'draft',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseTask" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,

    CONSTRAINT "ReleaseTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiScore" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL DEFAULT '',
    "risks" TEXT[],
    "model" TEXT NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchInfo" (
    "id" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "lastCommitAt" TIMESTAMP(3),
    "prId" INTEGER,
    "merged" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryIssueImported" (
    "id" TEXT NOT NULL,
    "sentryId" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentryIssueImported_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaleSnapshot" (
    "id" TEXT NOT NULL,
    "jiraKey" TEXT NOT NULL,
    "assignee" TEXT,
    "ageDays" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaleSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "IssueCache_status_idx" ON "IssueCache"("status");

-- CreateIndex
CREATE INDEX "IssueCache_assigneeJira_idx" ON "IssueCache"("assigneeJira");

-- CreateIndex
CREATE INDEX "CommentCache_jiraKey_idx" ON "CommentCache"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "CommentCache_jiraKey_author_body_key" ON "CommentCache"("jiraKey", "author", "body");

-- CreateIndex
CREATE INDEX "Watch_jiraKey_idx" ON "Watch"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "Watch_userId_jiraKey_key" ON "Watch"("userId", "jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "Release_targetLabel_key" ON "Release"("targetLabel");

-- CreateIndex
CREATE INDEX "ReleaseTask_jiraKey_idx" ON "ReleaseTask"("jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseTask_releaseId_jiraKey_key" ON "ReleaseTask"("releaseId", "jiraKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiScore_jiraKey_key" ON "AiScore"("jiraKey");

-- CreateIndex
CREATE INDEX "BranchInfo_repo_idx" ON "BranchInfo"("repo");

-- CreateIndex
CREATE INDEX "BranchInfo_merged_idx" ON "BranchInfo"("merged");

-- CreateIndex
CREATE UNIQUE INDEX "BranchInfo_repo_branch_key" ON "BranchInfo"("repo", "branch");

-- CreateIndex
CREATE UNIQUE INDEX "SentryIssueImported_sentryId_key" ON "SentryIssueImported"("sentryId");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StaleSnapshot_jiraKey_idx" ON "StaleSnapshot"("jiraKey");

-- CreateIndex
CREATE INDEX "StaleSnapshot_assignee_idx" ON "StaleSnapshot"("assignee");

-- AddForeignKey
ALTER TABLE "CommentCache" ADD CONSTRAINT "CommentCache_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watch" ADD CONSTRAINT "Watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseTask" ADD CONSTRAINT "ReleaseTask_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseTask" ADD CONSTRAINT "ReleaseTask_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiScore" ADD CONSTRAINT "AiScore_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentryIssueImported" ADD CONSTRAINT "SentryIssueImported_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaleSnapshot" ADD CONSTRAINT "StaleSnapshot_jiraKey_fkey" FOREIGN KEY ("jiraKey") REFERENCES "IssueCache"("jiraKey") ON DELETE CASCADE ON UPDATE CASCADE;
