ALTER TABLE "Notification"
ADD COLUMN "sourceLink" TEXT,
ADD COLUMN "sourceType" TEXT;

ALTER TABLE "NotificationOutbox"
ADD COLUMN "sourceLink" TEXT,
ADD COLUMN "sourceType" TEXT;
