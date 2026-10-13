-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('leader', 'member');

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectRole" NOT NULL DEFAULT 'leader',
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectKey","userId")
);

-- CreateIndex
CREATE INDEX "ProjectMember_projectKey_role_idx" ON "ProjectMember"("projectKey", "role");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
