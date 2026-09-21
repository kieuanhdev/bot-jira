-- Extend ReleaseStatus enum with checking and unknown states
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'checking' BEFORE 'ready';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'unknown' AFTER 'blocked';

-- Create ReleaseCheck table for persisting check results
CREATE TABLE "ReleaseCheck" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "blockers" JSONB,
    "sourceTimes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseCheck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReleaseCheck_releaseId_idx" ON "ReleaseCheck"("releaseId");
