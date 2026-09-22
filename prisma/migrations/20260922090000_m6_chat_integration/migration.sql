-- M6 — Chat integration: ChatIdentity (chat account <-> user link),
-- ChatMessage (command + result audit trail), ChatMessageConfirmation (pending
-- bulk/mutating command confirmations).

-- CreateTable
CREATE TABLE "ChatIdentity" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'discord',
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "linkedById" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ChatIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'discord',
    "externalMsgId" TEXT,
    "externalAuthorId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "command" TEXT,
    "raw" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'received',
    "result" JSONB,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageConfirmation" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'discord',
    "externalAuthorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatIdentity_externalId_key" ON "ChatIdentity"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatIdentity_provider_userId_key" ON "ChatIdentity"("provider", "userId");

-- CreateIndex
CREATE INDEX "ChatIdentity_userId_idx" ON "ChatIdentity"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_authorUserId_createdAt_idx" ON "ChatMessage"("authorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_provider_externalAuthorId_idx" ON "ChatMessage"("provider", "externalAuthorId");

-- CreateIndex
CREATE INDEX "ChatMessageConfirmation_userId_status_idx" ON "ChatMessageConfirmation"("userId", "status");

-- AddForeignKey
ALTER TABLE "ChatIdentity" ADD CONSTRAINT "ChatIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageConfirmation" ADD CONSTRAINT "ChatMessageConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
