-- Store one private Discord notification destination per Team Task Web user.
-- Webhook URLs are encrypted by the application before being persisted.
CREATE TABLE "DiscordIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationType" TEXT NOT NULL,
    "discordUserId" TEXT,
    "webhookUrlEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordIntegration_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DiscordIntegration_destination_check" CHECK (
      ("destinationType" = 'webhook' AND "webhookUrlEnc" IS NOT NULL AND "discordUserId" IS NULL)
      OR
      ("destinationType" = 'user_id' AND "discordUserId" IS NOT NULL AND "webhookUrlEnc" IS NULL)
    )
);

CREATE UNIQUE INDEX "DiscordIntegration_userId_key" ON "DiscordIntegration"("userId");
CREATE INDEX "DiscordIntegration_discordUserId_idx" ON "DiscordIntegration"("discordUserId");

ALTER TABLE "DiscordIntegration"
ADD CONSTRAINT "DiscordIntegration_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing explicit Discord identity links become private-DM destinations so
-- current users keep receiving Discord notifications after the rollout.
INSERT INTO "DiscordIntegration" (
  "id", "userId", "destinationType", "discordUserId", "createdAt", "updatedAt"
)
SELECT
  "id", "userId", 'user_id', "externalId", "linkedAt", CURRENT_TIMESTAMP
FROM "ChatIdentity"
WHERE "provider" = 'discord'
ON CONFLICT ("userId") DO NOTHING;
