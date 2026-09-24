-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "jiraIdentityKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_jiraIdentityKey_key" ON "User"("jiraIdentityKey");
