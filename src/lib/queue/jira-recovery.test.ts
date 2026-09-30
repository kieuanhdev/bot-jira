import { describe, expect, it, vi } from "vitest";
import { enqueueJiraRecoveries } from "./jira-recovery";

describe("enqueueJiraRecoveries", () => {
  it("dedupes stale and failed projects and reports queued/coalesced jobs", async () => {
    const enqueue = vi.fn()
      .mockResolvedValueOnce("job-cicm")
      .mockResolvedValueOnce(null);

    const result = await enqueueJiraRecoveries(["mr", "CICM", "MR"], enqueue);

    expect(enqueue.mock.calls).toEqual([["CICM"], ["MR"]]);
    expect(result).toEqual({
      requested: 2,
      queued: 1,
      coalesced: 1,
      failed: 0,
      errors: [],
    });
  });

  it("continues recovering other projects when one enqueue fails", async () => {
    const enqueue = vi.fn()
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce("job-mr");

    const result = await enqueueJiraRecoveries(["CICM", "MR"], enqueue);

    expect(result.queued).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toEqual(["CICM: queue unavailable"]);
  });
});
