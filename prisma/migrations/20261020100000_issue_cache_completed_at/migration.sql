-- AlterTable
ALTER TABLE "IssueCache" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Backfill from raw: Done At (customfield_10706) first, then resolutiondate.
-- Only well-formed ISO-8601 strings are cast so one bad value cannot abort the migration.
UPDATE "IssueCache"
SET "completedAt" = COALESCE(
  CASE WHEN raw->>'customfield_10706' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
       THEN (raw->>'customfield_10706')::timestamptz AT TIME ZONE 'UTC' END,
  CASE WHEN raw->>'resolutiondate' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
       THEN (raw->>'resolutiondate')::timestamptz AT TIME ZONE 'UTC' END
)
WHERE raw IS NOT NULL;
