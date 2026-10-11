ALTER TABLE "NotificationPreference"
ADD COLUMN IF NOT EXISTS "broadcastEnabled" BOOLEAN NOT NULL DEFAULT false;
