-- M8 — Stale analytics: extend StaleSnapshot with per-status age metrics,
-- classification, and severity.

ALTER TABLE "StaleSnapshot"
  ADD COLUMN "totalAgeDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stateAgeDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inactiveDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "blockedDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "stateAgeLowConfidence" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "staleReason" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "severity" TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN "status" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "statusCategory" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "slaDays" INTEGER NOT NULL DEFAULT 7;

CREATE INDEX "StaleSnapshot_staleReason_idx" ON "StaleSnapshot"("staleReason");
CREATE INDEX "StaleSnapshot_severity_idx" ON "StaleSnapshot"("severity");
CREATE INDEX "StaleSnapshot_status_idx" ON "StaleSnapshot"("status");
CREATE INDEX "StaleSnapshot_detectedAt_idx" ON "StaleSnapshot"("detectedAt");
