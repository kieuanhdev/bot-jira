import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  start: vi.fn(),
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

describe("Jira Queue Enqueueing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue("job-123");
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
        expireInSeconds: 120,
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
