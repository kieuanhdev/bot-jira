import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  claimJiraSyncLease,
  releaseJiraSyncLease,
  renewJiraSyncLease,
  SyncLeaseLostError,
} from "../../jira-sync-lease";
import { jiraSyncDependencies } from "./context";
import type { FinalizeRunInput, ProjectStats } from "./types";

const TEST_PREFIX = "CC36_";

function stats(projectKey: string): ProjectStats {
  return {
    projectKey,
    created: 0,
    updated: 0,
    comments: 0,
    deleted: 0,
    pages: 1,
    cursor: null,
    errors: [],
  };
}

async function createCursor(projectKey: string, runToken: string, cursor: string | null = null) {
  return prisma.integrationCursor.create({
    data: {
      integration: "jira",
      scope: projectKey,
      cursor,
      activeRunToken: runToken,
      activeRunStartedAt: new Date("2026-10-09T00:00:00.000Z"),
      activeRunExpiresAt: new Date("2026-10-09T01:00:00.000Z"),
    },
  });
}

function finalizeInput(
  cursor: Awaited<ReturnType<typeof createCursor>>,
  projectKey: string,
  runToken: string,
  overrides: Partial<FinalizeRunInput> = {}
): FinalizeRunInput {
  return {
    current: {
      id: cursor.id,
      cursor: cursor.cursor,
      lastSuccessAt: cursor.lastSuccessAt,
    },
    projectKey,
    runToken,
    cursor: cursor.cursor,
    cursorAdvanced: false,
    isFullScan: false,
    hasErrors: false,
    exhaustedAllPages: true,
    aborted: false,
    seenKeys: new Set(),
    stats: stats(projectKey),
    ...overrides,
  };
}

async function createIssue(jiraKey: string, projectKey: string, deletedAt: Date | null = null) {
  return prisma.issueCache.create({
    data: {
      jiraKey,
      projectKey,
      labels: [],
      fixVersionIds: [],
      fixVersionNames: [],
      deletedAt,
    },
  });
}

async function cleanRows() {
  await prisma.issueCache.deleteMany({
    where: { OR: [{ jiraKey: { startsWith: TEST_PREFIX } }, { projectKey: { startsWith: TEST_PREFIX } }] },
  });
  await prisma.integrationCursor.deleteMany({
    where: { integration: "jira", scope: { startsWith: TEST_PREFIX } },
  });
}

describe("Jira sync PostgreSQL integration", () => {
  beforeAll(async () => {
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT current_database() AS name
    `;
    if (!database || !/test/i.test(database.name)) {
      throw new Error(`Refusing DB integration test against database '${database?.name ?? "unknown"}'`);
    }
  });

  beforeEach(cleanRows);

  afterAll(async () => {
    await cleanRows();
    await prisma.$disconnect();
  });

  it("lets an expired lease be taken over and fences the previous owner", async () => {
    const projectKey = `${TEST_PREFIX}LEASE`;
    const firstNow = new Date("2026-10-09T00:00:00.000Z");
    const takeoverNow = new Date("2026-10-09T00:02:00.000Z");

    await claimJiraSyncLease(
      projectKey,
      "run-old",
      new Date("2026-10-09T00:01:00.000Z"),
      firstNow
    );
    await claimJiraSyncLease(
      projectKey,
      "run-new",
      new Date("2026-10-09T00:03:00.000Z"),
      takeoverNow
    );

    await expect(
      renewJiraSyncLease(projectKey, "run-old", new Date("2026-10-09T00:04:00.000Z"))
    ).rejects.toBeInstanceOf(SyncLeaseLostError);
    await expect(releaseJiraSyncLease(projectKey, "run-old")).resolves.toBe(false);
    await expect(
      prisma.integrationCursor.findUniqueOrThrow({
        where: { integration_scope: { integration: "jira", scope: projectKey } },
      })
    ).resolves.toMatchObject({ activeRunToken: "run-new" });
  });

  it("rolls back soft deletes when the final fencing update loses ownership", async () => {
    const projectKey = `${TEST_PREFIX}ROLLBACK`;
    const runToken = "run-owner";
    const cursor = await createCursor(projectKey, runToken);
    const issue = await createIssue(`${TEST_PREFIX}ROLLBACK_1`, projectKey);

    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION clean_code_36_steal_lease()
      RETURNS trigger AS $$
      BEGIN
        UPDATE "IntegrationCursor"
        SET "activeRunToken" = 'run-takeover'
        WHERE integration = 'jira' AND scope = NEW."projectKey";
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER clean_code_36_steal_lease_trigger
      BEFORE UPDATE OF "deletedAt" ON "IssueCache"
      FOR EACH ROW EXECUTE FUNCTION clean_code_36_steal_lease();
    `);

    try {
      await expect(
        jiraSyncDependencies.finalizeRun(
          finalizeInput(cursor, projectKey, runToken, { isFullScan: true })
        )
      ).rejects.toBeInstanceOf(SyncLeaseLostError);
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS clean_code_36_steal_lease_trigger ON "IssueCache";
        DROP FUNCTION IF EXISTS clean_code_36_steal_lease();
      `);
    }

    await expect(
      prisma.issueCache.findUniqueOrThrow({ where: { jiraKey: issue.jiraKey } })
    ).resolves.toMatchObject({ deletedAt: null });
    await expect(
      prisma.integrationCursor.findUniqueOrThrow({ where: { id: cursor.id } })
    ).resolves.toMatchObject({ activeRunToken: runToken, cursor: null });
  });

  it("advances the cursor and releases the lease in one successful finalize transaction", async () => {
    const projectKey = `${TEST_PREFIX}CURSOR`;
    const runToken = "run-cursor";
    const oldCursor = "2026-10-08T00:00:00.000Z";
    const newCursor = "2026-10-09T00:00:00.000Z";
    const cursor = await createCursor(projectKey, runToken, oldCursor);

    await jiraSyncDependencies.finalizeRun(
      finalizeInput(cursor, projectKey, runToken, {
        cursor: newCursor,
        cursorAdvanced: true,
      })
    );

    const stored = await prisma.integrationCursor.findUniqueOrThrow({ where: { id: cursor.id } });
    expect(stored).toMatchObject({
      cursor: newCursor,
      activeRunToken: null,
      activeRunStartedAt: null,
      activeRunExpiresAt: null,
      lastError: null,
    });
    expect(stored.lastSuccessAt).toBeInstanceOf(Date);
    expect(stored.stats).toMatchObject({ cursorAdvanced: true });
  });

  it("soft deletes only unseen active issues after a complete error-free full scan", async () => {
    const projectKey = `${TEST_PREFIX}SOFT_DELETE`;
    const runToken = "run-full";
    const cursor = await createCursor(projectKey, runToken);
    const seenKey = `${TEST_PREFIX}SEEN`;
    const unseenKey = `${TEST_PREFIX}UNSEEN`;
    const otherProjectKey = `${TEST_PREFIX}OTHER`;
    const alreadyDeletedAt = new Date("2026-10-01T00:00:00.000Z");

    await Promise.all([
      createIssue(seenKey, projectKey),
      createIssue(unseenKey, projectKey),
      createIssue(`${TEST_PREFIX}OTHER_1`, otherProjectKey),
      createIssue(`${TEST_PREFIX}DELETED`, projectKey, alreadyDeletedAt),
    ]);

    const result = await jiraSyncDependencies.finalizeRun(
      finalizeInput(cursor, projectKey, runToken, {
        isFullScan: true,
        seenKeys: new Set([seenKey]),
      })
    );
    const issues = await prisma.issueCache.findMany({
      where: { jiraKey: { startsWith: TEST_PREFIX } },
    });
    const byKey = new Map(issues.map((issue) => [issue.jiraKey, issue]));

    expect(result.deleted).toBe(1);
    expect(byKey.get(seenKey)?.deletedAt).toBeNull();
    expect(byKey.get(unseenKey)?.deletedAt).toBeInstanceOf(Date);
    expect(byKey.get(`${TEST_PREFIX}OTHER_1`)?.deletedAt).toBeNull();
    expect(byKey.get(`${TEST_PREFIX}DELETED`)?.deletedAt).toEqual(alreadyDeletedAt);
  });
});
