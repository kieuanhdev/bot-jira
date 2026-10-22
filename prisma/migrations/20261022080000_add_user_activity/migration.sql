-- CreateTable
CREATE TABLE IF NOT EXISTS "UserActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "eventType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "path" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserActivity_createdAt_idx" ON "UserActivity"("createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserActivity_userId_createdAt_idx" ON "UserActivity"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserActivity_eventType_createdAt_idx" ON "UserActivity"("eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserActivity_path_idx" ON "UserActivity"("path");
