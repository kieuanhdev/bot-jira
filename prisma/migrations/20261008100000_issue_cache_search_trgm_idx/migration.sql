-- Board search uses `contains` + `mode: insensitive` (ILIKE '%q%') on summary and jiraKey.
-- Trigram GIN indexes let Postgres answer it without scanning the whole table.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "IssueCache_summary_trgm_idx" ON "IssueCache" USING GIN ("summary" gin_trgm_ops);
CREATE INDEX "IssueCache_jiraKey_trgm_idx" ON "IssueCache" USING GIN ("jiraKey" gin_trgm_ops);
