import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  start: vi.fn(),
  cursorUpsert: vi.fn(),
  cursorUpdate: vi.fn(),
  jiraProjectFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      upsert: mocks.cursorUpsert,
      update: mocks.cursorUpdate,
    },
    jiraProject: {
      findMany: mocks.jiraProjectFindMany,
    },
  },
}));

vi.mock("pg-boss", () => {
  return {
    PgBoss: class {
      start() {
        mocks.start();
        return Promise.resolve(this);
      }
      send(...args: unknown[]) {
        return mocks.send(...args);
      }
    },
  };
});

import { enqueueJiraProjectSync, enqueueJiraDispatch, enqueueJiraSync } from "./boss";
import { jiraProjectList } from "@/lib/env";

describe("Jira Queue Enqueueing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue("job-123");
    mocks.jiraProjectFindMany.mockResolvedValue(
      jiraProjectList.map((key) => ({ key }))
    );
  });

  it("enqueueJiraProjectSync normalizes projectKey and sets priority 10 for manual sync", async () => {
    const jobId = await enqueueJiraProjectSync({
      projectKey: "  epm  ",
      full: false,
      source: "manual",
      requestedBy: "user-1",
    });

    expect(jobId).toBe("job-123");
    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({
        projectKey: "EPM",
        source: "manual",
        requestedBy: "user-1",
        full: false,
      }),
      expect.objectContaining({
        singletonKey: "EPM",
        priority: 10,
        retryLimit: 4,
        retryDelay: 10,
        retryBackoff: true,
        expireInSeconds: 900,
        heartbeatSeconds: 60,
      })
    );
  });

  it("enqueueJiraProjectSync sets priority 1 for scheduled sync", async () => {
    await enqueueJiraProjectSync({
      projectKey: "CICM",
      source: "schedule",
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({
        projectKey: "CICM",
        source: "schedule",
      }),
      expect.objectContaining({
        singletonKey: "CICM",
        priority: 1,
      })
    );
  });

  it("enqueueJiraDispatch sends to poll-jira-dispatch queue with singletonKey jira-dispatch", async () => {
    const jobId = await enqueueJiraDispatch({
      source: "schedule",
    });

    expect(jobId).toBe("job-123");
    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-dispatch",
      expect.objectContaining({
        source: "schedule",
      }),
      expect.objectContaining({
        singletonKey: "jira-dispatch",
        priority: 1,
        retryLimit: 2,
        expireInSeconds: 60,
      })
    );
  });

  it("enqueueJiraSync delegates to enqueueJiraProjectSync when projectKey is present", async () => {
    await enqueueJiraSync({
      projectKey: "MR",
      full: true,
      requestedBy: "admin-1",
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({
        projectKey: "MR",
        full: true,
      }),
      expect.objectContaining({
        singletonKey: "MR",
        priority: 10,
      })
    );
  });

  it("enqueueJiraProjectSync sets priority 5 and singletonSeconds 240 for recovery sync", async () => {
    const jobId = await enqueueJiraProjectSync({
      projectKey: "CICM",
      source: "recovery",
    });

    expect(jobId).toBe("job-123");
    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({
        projectKey: "CICM",
        source: "recovery",
      }),
      expect.objectContaining({
        singletonKey: "CICM",
        singletonSeconds: 240,
        priority: 5,
        retryLimit: 4,
        retryDelay: 10,
        retryBackoff: true,
        expireInSeconds: 900,
        heartbeatSeconds: 60,
      })
    );
  });

  it("enqueueJiraProjectSync sets priority 2 for startup sync and 900s expiry for full sync", async () => {
    await enqueueJiraProjectSync({
      projectKey: "CICM",
      source: "startup",
      full: true,
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({
        projectKey: "CICM",
        source: "startup",
        full: true,
      }),
      expect.objectContaining({
        singletonKey: "CICM",
        singletonSeconds: 55,
        priority: 2,
        expireInSeconds: 900,
      })
    );
  });

  it("enqueueJiraSync delegates to enqueueJiraDispatch when projectKey is omitted", async () => {
    await enqueueJiraSync({
      full: false,
    });

    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-dispatch",
      expect.objectContaining({
        full: false,
        source: "schedule",
      }),
      expect.objectContaining({
        singletonKey: "jira-dispatch",
      })
    );
  });
});

describe("reconcileStartupJiraProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue("job-rec-1");
  });

  it("enqueues only stale/failing projects and skips healthy projects", async () => {
    const { reconcileStartupJiraProjects } = await import("./boss");
    const { getWorkerHealth } = await import("@/lib/health/worker-health");

    vi.mock("@/lib/health/worker-health", () => ({
      getWorkerHealth: vi.fn(),
    }));

    vi.mocked(getWorkerHealth).mockResolvedValueOnce({
      status: "degraded",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 400_000,
      hasErrors: true,
      staleProjects: ["CICM"],
      failingProjects: ["MR"],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });

    const result = await reconcileStartupJiraProjects();

    expect(result.staleCount).toBe(2);
    expect(result.queued).toBe(2);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({ projectKey: "CICM", source: "startup" }),
      expect.objectContaining({ priority: 2 })
    );
    expect(mocks.send).toHaveBeenCalledWith(
      "poll-jira-project",
      expect.objectContaining({ projectKey: "MR", source: "startup" }),
      expect.objectContaining({ priority: 2 })
    );
  });

  it("does not enqueue anything when all projects are healthy", async () => {
    const { reconcileStartupJiraProjects } = await import("./boss");
    const { getWorkerHealth } = await import("@/lib/health/worker-health");

    vi.mocked(getWorkerHealth).mockResolvedValueOnce({
      status: "healthy",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 30_000,
      hasErrors: false,
      staleProjects: [],
      failingProjects: [],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });

    const result = await reconcileStartupJiraProjects();

    expect(result.staleCount).toBe(0);
    expect(result.queued).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("enqueues all configured projects on startup reconciliation for fresh database with zero cursors", async () => {
    const { reconcileStartupJiraProjects } = await import("./boss");
    const { getWorkerHealth } = await import("@/lib/health/worker-health");
    const { jiraProjectList } = await import("@/lib/env");

    vi.mocked(getWorkerHealth).mockResolvedValueOnce({
      status: "degraded",
      workerAgeMs: null,
      jiraSyncAgeMs: null,
      hasErrors: false,
      staleProjects: [...jiraProjectList],
      failingProjects: [],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });

    const result = await reconcileStartupJiraProjects();

    expect(result.staleCount).toBe(jiraProjectList.length);
    expect(result.queued).toBe(jiraProjectList.length);
    expect(mocks.send).toHaveBeenCalledTimes(jiraProjectList.length);
  });
});

describe("recordRun execution behavior", () => {
  it("does not update lastSuccessAt when a job is skipped", async () => {
    const { recordRun } = await import("./boss");

    const previousSuccess = new Date("2026-09-30T07:00:00.000Z");
    mocks.cursorUpsert.mockResolvedValueOnce({
      id: "cur-1",
      integration: "worker",
      scope: "poll-jira-project:EPM",
      cursor: null,
      lastStartedAt: new Date(),
      lastSuccessAt: previousSuccess,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await recordRun("poll-jira-project:EPM", async () => ({
      ok: true,
      skipped: true,
      reason: "Stale job skipped",
    }));

    expect(mocks.cursorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cur-1" },
        data: expect.objectContaining({
          lastSuccessAt: previousSuccess, // preserved, not updated
        }),
      })
    );
  });

  it("updates lastSuccessAt when a job runs successfully and is not skipped", async () => {
    const { recordRun } = await import("./boss");

    const previousSuccess = new Date("2026-09-30T07:00:00.000Z");
    mocks.cursorUpsert.mockResolvedValueOnce({
      id: "cur-2",
      integration: "worker",
      scope: "poll-jira-project:EPM",
      cursor: null,
      lastStartedAt: new Date(),
      lastSuccessAt: previousSuccess,
      lastErrorAt: null,
      lastError: null,
      stats: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await recordRun("poll-jira-project:EPM", async () => ({
      ok: true,
      stats: { created: 1 },
    }));

    expect(mocks.cursorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cur-2" },
        data: expect.objectContaining({
          lastSuccessAt: expect.any(Date),
        }),
      })
    );
  });
});
