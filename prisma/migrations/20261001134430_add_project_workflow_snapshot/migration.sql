-- CreateTable
CREATE TABLE "JiraProjectWorkflowSnapshot" (
    "id" TEXT NOT NULL,
    "projectKey" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JiraProjectWorkflowSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JiraProjectWorkflowStatus" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,

    CONSTRAINT "JiraProjectWorkflowStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JiraProjectWorkflowSnapshot_projectKey_key" ON "JiraProjectWorkflowSnapshot"("projectKey");

-- CreateIndex
CREATE INDEX "JiraProjectWorkflowStatus_snapshotId_displayOrder_idx" ON "JiraProjectWorkflowStatus"("snapshotId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "JiraProjectWorkflowStatus_snapshotId_statusId_key" ON "JiraProjectWorkflowStatus"("snapshotId", "statusId");

-- AddForeignKey
ALTER TABLE "JiraProjectWorkflowStatus" ADD CONSTRAINT "JiraProjectWorkflowStatus_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "JiraProjectWorkflowSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill initial workflow snapshots from distinct statuses in IssueCache
DO $$
DECLARE
    r RECORD;
    snap_id TEXT;
    status_row RECORD;
    order_idx INT;
BEGIN
    FOR r IN (
        SELECT DISTINCT "projectKey"
        FROM "IssueCache"
        WHERE "projectKey" IS NOT NULL AND "projectKey" <> '' AND "deletedAt" IS NULL
    ) LOOP
        snap_id := 'snap_' || md5(r."projectKey" || clock_timestamp()::text);
        
        INSERT INTO "JiraProjectWorkflowSnapshot" ("id", "projectKey", "fetchedAt", "createdAt", "updatedAt")
        VALUES (snap_id, r."projectKey", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("projectKey") DO NOTHING;

        SELECT "id" INTO snap_id FROM "JiraProjectWorkflowSnapshot" WHERE "projectKey" = r."projectKey";

        order_idx := 0;
        FOR status_row IN (
            SELECT s_id, s_name, s_cat
            FROM (
                SELECT DISTINCT
                    COALESCE(NULLIF("statusId", ''), "status") AS s_id,
                    "status" AS s_name,
                    COALESCE(NULLIF("statusCategory", ''), 'unknown') AS s_cat
                FROM "IssueCache"
                WHERE "projectKey" = r."projectKey" AND "deletedAt" IS NULL AND "status" <> ''
            ) sub
            ORDER BY
                CASE
                    WHEN s_cat = 'new' THEN 1
                    WHEN s_cat = 'indeterminate' THEN 2
                    WHEN s_cat = 'done' THEN 3
                    ELSE 4
                END,
                s_name
        ) LOOP
            order_idx := order_idx + 1;
            INSERT INTO "JiraProjectWorkflowStatus" ("id", "snapshotId", "statusId", "name", "category", "displayOrder")
            VALUES (
                'st_' || md5(snap_id || status_row.s_id),
                snap_id,
                status_row.s_id,
                status_row.s_name,
                status_row.s_cat,
                order_idx
            )
            ON CONFLICT ("snapshotId", "statusId") DO NOTHING;
        END LOOP;
    END LOOP;
END $$;
