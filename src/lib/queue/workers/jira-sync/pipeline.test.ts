import { describe, expect, it, vi } from "vitest";
import type { JiraSyncClient, JiraSyncDependencies } from "./types";
import { runJiraSyncPipeline } from "./runner";
import { SyncLeaseLostError } from "../../jira-sync-lease";

function createHarness() {
  const events: string[] = [];
  const dependencies: JiraSyncDependencies = {
    now: () => new Date("2026-10-09T00:00:00.000Z"),
    overlapSeconds: 300,
    claimLease: async () => {
      events.push("claim");
      return { id: "cursor-1", cursor: null, lastSuccessAt: null };
    },
    renewLease: async () => {
      events.push("renew");
    },
    releaseLease: async () => {
      events.push("release");
      return true;
    },
    buildJql: () => "project = EPM ORDER BY updated ASC",
    loadPeopleFields: async () => ({}),
    findPreviousIssues: async () => {
      events.push("find-previous");
      return [];
    },
    upsertIssue: vi.fn<JiraSyncDependencies["upsertIssue"]>(),
    upsertComments: vi.fn<JiraSyncDependencies["upsertComments"]>(),
    notifyIssue: vi.fn<JiraSyncDependencies["notifyIssue"]>(),
    notifyComment: vi.fn<JiraSyncDependencies["notifyComment"]>(),
    parseDate: (value) => (value ? new Date(value) : undefined),
    saveWorkflowSnapshot: async () => ({ statusCount: 0 }),
    finalizeRun: async () => {
      events.push("finalize");
      return { deleted: 0, lastSuccessAt: null, lastError: null };
    },
    recordError: async () => {
      events.push("record-error");
    },
    warn: vi.fn(),
  };
  const jira: JiraSyncClient = {
    search: vi.fn(async () => {
      events.push("fetch");
      return { startAt: 0, maxResults: 50, total: 0, issues: [] };
    }),
    getComments: vi.fn(async () => []),
    getProjectStatuses: vi.fn(async () => {
      events.push("fetch-workflow");
      return [];
    }),
  };

  return { dependencies, events, jira };
}

describe("runJiraSyncPipeline", () => {
  it("keeps lease checkpoints before fetch, before page writes, and before finalize", async () => {
    const { dependencies, events, jira } = createHarness();

    await runJiraSyncPipeline(
      {
        projectKey: "EPM",
        full: false,
        runToken: "run-1",
        leaseTtlSeconds: 900,
        jira,
      },
      dependencies
    );

    expect(events).toEqual([
      "claim",
      "renew",
      "fetch",
      "renew",
      "find-previous",
      "renew",
      "fetch-workflow",
      "renew",
      "finalize",
      "release",
    ]);
  });

  it("stops before page persistence when the post-fetch lease renewal fails", async () => {
    const { dependencies, events, jira } = createHarness();
    let renewals = 0;
    dependencies.renewLease = async () => {
      events.push("renew");
      renewals++;
      if (renewals === 2) throw new SyncLeaseLostError("lease changed");
    };

    await expect(
      runJiraSyncPipeline(
        {
          projectKey: "EPM",
          full: false,
          runToken: "run-1",
          leaseTtlSeconds: 900,
          jira,
        },
        dependencies
      )
    ).rejects.toThrow(SyncLeaseLostError);

    expect(events).toEqual(["claim", "renew", "fetch", "renew", "release"]);
    expect(events).not.toContain("record-error");
    expect(events).not.toContain("finalize");
  });
});
