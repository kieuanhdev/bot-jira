-- CreateTable
CREATE TABLE "JiraProject" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "jiraId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "discoveredById" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastValidationCode" TEXT,
    "bootstrapState" TEXT DEFAULT 'ready',
    "lastBootstrapAt" TIMESTAMP(3),
    "lastBootstrapError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraProject_key_key" ON "JiraProject"("key");

-- CreateIndex
CREATE INDEX "JiraProject_active_syncEnabled_idx" ON "JiraProject"("active", "syncEnabled");

-- CreateIndex
CREATE INDEX "JiraProject_name_idx" ON "JiraProject"("name");

-- AddForeignKey
ALTER TABLE "JiraProject" ADD CONSTRAINT "JiraProject_discoveredById_fkey" FOREIGN KEY ("discoveredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill Jira projects from bootstrap list and existing database tables
DO $$
DECLARE
    bootstrap_keys TEXT[] := ARRAY['CICM', 'EDM', 'EMA', 'EPM', 'ETM', 'MHRM', 'MR'];
    k TEXT;
    r RECORD;
BEGIN
    -- 1. Insert bootstrap projects
    FOREACH k IN ARRAY bootstrap_keys LOOP
        INSERT INTO "JiraProject" (
            "id", "key", "name", "active", "source", "syncEnabled", "bootstrapState", "createdAt", "updatedAt"
        ) VALUES (
            'proj_' || md5(k),
            k,
            k,
            true,
            'bootstrap',
            true,
            'ready',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT ("key") DO NOTHING;
    END LOOP;

    -- 2. Backfill from User.boardProjects, IssueCache, IntegrationCursor, JiraProjectWorkflowSnapshot
    FOR r IN (
        SELECT DISTINCT p_key
        FROM (
            SELECT UPPER(TRIM(unnest("boardProjects"))) AS p_key FROM "User"
            UNION
            SELECT UPPER(TRIM("projectKey")) AS p_key FROM "IssueCache" WHERE "projectKey" IS NOT NULL AND "projectKey" <> ''
            UNION
            SELECT UPPER(TRIM("scope")) AS p_key FROM "IntegrationCursor" WHERE "integration" = 'jira' AND "scope" IS NOT NULL AND "scope" <> ''
            UNION
            SELECT UPPER(TRIM("projectKey")) AS p_key FROM "JiraProjectWorkflowSnapshot" WHERE "projectKey" IS NOT NULL AND "projectKey" <> ''
        ) sub
        WHERE p_key ~ '^[A-Z][A-Z0-9_]{1,19}$'
    ) LOOP
        INSERT INTO "JiraProject" (
            "id", "key", "name", "active", "source", "syncEnabled", "bootstrapState", "createdAt", "updatedAt"
        ) VALUES (
            'proj_' || md5(r.p_key),
            r.p_key,
            r.p_key,
            true,
            'migration',
            true,
            'ready',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT ("key") DO NOTHING;
    END LOOP;
END $$;

