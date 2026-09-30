-- AlterTable
ALTER TABLE "IssueCache" ADD COLUMN "originalEstimateSeconds" INTEGER;

-- Backfill from raw JSON where available
UPDATE "IssueCache"
SET "originalEstimateSeconds" = CAST("raw"->>'timeoriginalestimate' AS INTEGER)
WHERE "raw"->>'timeoriginalestimate' IS NOT NULL AND "raw"->>'timeoriginalestimate' ~ '^\d+$';
