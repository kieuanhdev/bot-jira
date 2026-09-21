-- Create ReleaseGateResult table for per-gate check history (M3-02)
CREATE TABLE "ReleaseGateResult" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "details" JSONB,
    "sourceTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReleaseGateResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReleaseGateResult_checkId_idx" ON "ReleaseGateResult"("checkId");
CREATE INDEX "ReleaseGateResult_gate_idx" ON "ReleaseGateResult"("gate");

-- Add FK from ReleaseCheck.releaseId to Release.id (relation added in M3-02)
ALTER TABLE "ReleaseCheck" ADD CONSTRAINT "ReleaseCheck_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add FK from ReleaseGateResult.checkId to ReleaseCheck.id
ALTER TABLE "ReleaseGateResult" ADD CONSTRAINT "ReleaseGateResult_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ReleaseCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
