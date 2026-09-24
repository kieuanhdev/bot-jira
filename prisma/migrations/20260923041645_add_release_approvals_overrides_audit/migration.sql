-- CreateTable
CREATE TABLE "ReleaseApproval" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ReleaseApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseGateOverride" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "gate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ReleaseGateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "source" TEXT,
    "target" TEXT,
    "before" JSONB,
    "after" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseApproval_releaseId_revokedAt_idx" ON "ReleaseApproval"("releaseId", "revokedAt");

-- CreateIndex
CREATE INDEX "ReleaseApproval_approvedById_idx" ON "ReleaseApproval"("approvedById");

-- CreateIndex
CREATE INDEX "ReleaseGateOverride_releaseId_gate_revokedAt_expiresAt_idx" ON "ReleaseGateOverride"("releaseId", "gate", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "ReleaseGateOverride_createdById_idx" ON "ReleaseGateOverride"("createdById");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_target_idx" ON "AuditLog"("target");

-- CreateIndex
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");

-- AddForeignKey
ALTER TABLE "ReleaseApproval" ADD CONSTRAINT "ReleaseApproval_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseGateOverride" ADD CONSTRAINT "ReleaseGateOverride_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
