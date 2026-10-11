ALTER TABLE "NotificationPreference"
ALTER COLUMN "disabledTypes" SET DEFAULT ARRAY['ai', 'system']::TEXT[];

UPDATE "NotificationPreference"
SET "disabledTypes" = ARRAY(
  SELECT DISTINCT notification_type
  FROM unnest("disabledTypes" || ARRAY['ai', 'system']::TEXT[])
    AS notification_types(notification_type)
);
