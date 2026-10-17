-- AlterTable
ALTER TABLE "User" ADD COLUMN "sentryOrg" TEXT,
ADD COLUMN "sentryMappings" TEXT,
ADD COLUMN "sentryTokenEnc" TEXT,
ADD COLUMN "sentryVerifiedAt" TIMESTAMP(3),
ADD COLUMN "sentryLastError" TEXT;
