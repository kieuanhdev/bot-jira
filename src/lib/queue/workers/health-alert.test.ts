import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyAll: vi.fn(),
  getWorkerHealth: vi.fn(),
  cursorFindUnique: vi.fn(),
  cursorUpsert: vi.fn(),
  outboxFindFirst: vi.fn(),
}));

vi.mock("@/lib/notify", () => ({
  notifyAll: mocks.notifyAll,
}));

vi.mock("@/lib/health/worker-health", () => ({
  getWorkerHealth: mocks.getWorkerHealth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      findUnique: mocks.cursorFindUnique,
      upsert: mocks.cursorUpsert,
    },
    notificationOutbox: {
      findFirst: mocks.outboxFindFirst,
    },
  },
}));

import { runHealthAlert } from "./health-alert";

describe("runHealthAlert watchdog & self-healing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notifyAll.mockResolvedValue(undefined);
    mocks.cursorUpsert.mockResolvedValue({});
    mocks.outboxFindFirst.mockResolvedValue(null);
  });

  it("enqueues recovery and sends warning alerts when projects are stale or failing", async () => {
    mocks.getWorkerHealth.mockResolvedValueOnce({
      status: "degraded",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 400_000,
      hasErrors: true,
      staleProjects: ["CICM"],
      failingProjects: ["MR"],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });
    mocks.cursorFindUnique.mockResolvedValueOnce(null); // No previous alerts

    const enqueueRecovery = vi.fn()
      .mockResolvedValueOnce("job-rec-cicm")
      .mockResolvedValueOnce("job-rec-mr");

    const result = await runHealthAlert({ enqueueJiraRecovery: enqueueRecovery });

    expect(result.ok).toBe(true);
    expect(enqueueRecovery).toHaveBeenCalledWith("CICM");
    expect(enqueueRecovery).toHaveBeenCalledWith("MR");
    expect(result.stats?.recoveryRequested).toBe(2);
    expect(result.stats?.recoveryQueued).toBe(2);
    expect(result.stats?.alerted).toBe(2);

    expect(mocks.notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("CICM"),
        severity: "warning",
      })
    );
    expect(mocks.notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("MR"),
        severity: "warning",
      })
    );
  });

  it("sends recovery notification when a stale project recovers in next cycle", async () => {
    // Current health: CICM is recovered, MR is still failing
    mocks.getWorkerHealth.mockResolvedValueOnce({
      status: "degraded",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 30_000,
      hasErrors: true,
      staleProjects: [],
      failingProjects: ["MR"],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });
    // Previous state had both CICM and MR
    mocks.cursorFindUnique.mockResolvedValueOnce({
      stats: { activeKeys: "jira-failed:MR,jira-stale:CICM" },
    });

    const enqueueRecovery = vi.fn().mockResolvedValue("job-rec-mr");
    const result = await runHealthAlert({ enqueueJiraRecovery: enqueueRecovery });

    expect(result.ok).toBe(true);
    // MR was already announced in prevKeys, so alerted = 0
    expect(result.stats?.alerted).toBe(0);
    // CICM was in prevKeys but resolved now, so recovered = 1
    expect(result.stats?.recovered).toBe(1);

    expect(mocks.notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Đồng bộ Jira đã phục hồi: CICM",
        severity: "success",
      })
    );
  });

  it("does not enqueue recoveries when worker is down", async () => {
    mocks.getWorkerHealth.mockResolvedValueOnce({
      status: "down",
      workerAgeMs: 150_000,
      jiraSyncAgeMs: null,
      hasErrors: true,
      staleProjects: ["CICM"],
      failingProjects: [],
      jobs: [],
      checkedAt: new Date().toISOString(),
    });
    mocks.cursorFindUnique.mockResolvedValueOnce(null);

    const enqueueRecovery = vi.fn();
    const result = await runHealthAlert({ enqueueJiraRecovery: enqueueRecovery });

    expect(result.ok).toBe(true);
    expect(enqueueRecovery).not.toHaveBeenCalled();
    expect(result.stats?.recoveryRequested).toBe(0);
    expect(mocks.notifyAll).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Worker down",
        severity: "warning",
      })
    );
  });
});
