-- Rows from the old auto-import were never approved by a person, so anything
-- not yet filed into Jira now waits for a human decision.
-- Kept separate from the enum change: Postgres cannot use a newly added enum
-- value in the same transaction that added it.
UPDATE "SentryIssueImported" SET "state" = 'review' WHERE "state" IN ('pending', 'failed') AND "jiraKey" IS NULL;
