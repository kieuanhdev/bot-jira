-- CreateTable
CREATE TABLE "UserBoardPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "boardId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBoardPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserBoardPreference_boardId_idx" ON "UserBoardPreference"("boardId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBoardPreference_userId_projectKey_key" ON "UserBoardPreference"("userId", "projectKey");

-- AddForeignKey
ALTER TABLE "UserBoardPreference" ADD CONSTRAINT "UserBoardPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
