-- AlterTable
ALTER TABLE "IntegrationCursor" ADD COLUMN "activeRunToken" TEXT,
ADD COLUMN "activeRunStartedAt" TIMESTAMP(3),
ADD COLUMN "activeRunExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "IntegrationCursor_integration_activeRunExpiresAt_idx" ON "IntegrationCursor"("integration", "activeRunExpiresAt");
