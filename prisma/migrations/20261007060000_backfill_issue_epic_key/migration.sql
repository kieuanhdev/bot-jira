-- Backfill IssueCache.epicKey for rows synced before the column existed.
-- Covers the parent / epic link object forms; rows using a custom Epic Link
-- field are filled by the next full sync (npm run backfill:people).
UPDATE "IssueCache"
SET "epicKey" = COALESCE("raw"->'parent'->>'key', "raw"->'epic'->>'key')
WHERE "epicKey" IS NULL
  AND COALESCE("raw"->'parent'->>'key', "raw"->'epic'->>'key') IS NOT NULL;
