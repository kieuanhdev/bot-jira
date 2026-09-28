-- PostgreSQL delivers the signal only after the transaction commits.
CREATE FUNCTION notify_notification_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_changes', NEW."userId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_change
AFTER INSERT OR UPDATE ON "Notification"
FOR EACH ROW EXECUTE FUNCTION notify_notification_change();
