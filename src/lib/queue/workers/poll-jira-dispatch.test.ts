import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueJiraProjectSync: vi.fn(),
}));

vi.mock("@/lib/jira/project-catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jira/project-catalog")>();
  return {
    ...actual,
    listSyncEnabledProjectKeys: vi.fn().mockResolvedValue(["CICM", "EPM", "MR"]),
  };
});

vi.mock("@/lib/queue/boss", () => ({
  enqueueJiraProjectSync: mocks.enqueueJiraProjectSync,
}));

import { runPollJiraDispatch } from "./poll-jira-dispatch";

describe("runPollJiraDispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueJiraProjectSync.mockResolvedValue("job-123");
  });

  it("fans out configured projects to individual project sync jobs", async () => {
    const res = await runPollJiraDispatch({ source: "schedule" });

    expect(res.ok).toBe(true);
    expect(res.stats?.requested).toBe(3);
    expect(res.stats?.queued).toBe(3);
    expect(res.stats?.coalesced).toBe(0);
    expect(res.stats?.rejected).toBe(0);
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledTimes(3);
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "CICM",
        source: "schedule",
        full: false,
      })
    );
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "EPM",
        source: "schedule",
        full: false,
      })
    );
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "MR",
        source: "schedule",
        full: false,
      })
    );
  });

  it("normalizes, trims, and deduplicates custom projectKeys", async () => {
    const res = await runPollJiraDispatch({
      projectKeys: [" epm ", "EPM", "mr", "UNKNOWN_FORMAT!@#"],
      source: "admin",
      full: true,
      requestedBy: "admin-1",
    });

    expect(res.ok).toBe(true);
    expect(res.stats?.requested).toBe(2); // EPM and MR
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledTimes(2);
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "EPM",
        full: true,
        source: "admin",
        requestedBy: "admin-1",
      })
    );
  });

  it("counts coalesced jobs when enqueue returns null", async () => {
    mocks.enqueueJiraProjectSync
      .mockResolvedValueOnce("job-1")
      .mockResolvedValueOnce(null) // coalesced
      .mockResolvedValueOnce("job-3");

    const res = await runPollJiraDispatch({ source: "schedule" });

    expect(res.ok).toBe(true);
    expect(res.stats?.queued).toBe(2);
    expect(res.stats?.coalesced).toBe(1);
    expect(res.stats?.rejected).toBe(0);
  });

  it("handles partial failure without stopping other projects", async () => {
    mocks.enqueueJiraProjectSync
      .mockResolvedValueOnce("job-1")
      .mockRejectedValueOnce(new Error("Queue error on EPM"))
      .mockResolvedValueOnce("job-3");

    const res = await runPollJiraDispatch({ source: "schedule" });

    expect(res.ok).toBe(false);
    expect(res.stats?.queued).toBe(2);
    expect(res.stats?.rejected).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors?.[0]).toContain("Queue error on EPM");
  });
});
