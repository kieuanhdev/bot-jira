import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scoreFindUnique: vi.fn(),
  decisionCreate: vi.fn(),
  updateIssue: vi.fn(),
  refreshJiraIssueCache: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiScore: { findUnique: mocks.scoreFindUnique },
    aiEstimateDecision: { create: mocks.decisionCreate },
  },
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    updateIssue: mocks.updateIssue,
  }),
}));
vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: mocks.refreshJiraIssueCache,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { recordEstimateDecision } from "./decision";

describe("recordEstimateDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scoreFindUnique.mockResolvedValue({ id: "s-1", points: 5 });
    mocks.decisionCreate.mockResolvedValue({});
    mocks.updateIssue.mockResolvedValue({});
    mocks.refreshJiraIssueCache.mockResolvedValue({});
  });

  it("returns 404 when aiScore is not found", async () => {
    mocks.scoreFindUnique.mockResolvedValue(null);
    const result = await recordEstimateDecision({
      key: "EPM-1",
      decision: "accepted",
      userId: "u-1",
      auth: { user: "alice", token: "tok", authMode: "Bearer" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("updates Jira on accepted decision", async () => {
    const result = await recordEstimateDecision({
      key: "EPM-1",
      decision: "accepted",
      userId: "u-1",
      auth: { user: "alice", token: "tok", authMode: "Bearer" },
    });
    expect(result.ok).toBe(true);
    expect(mocks.updateIssue).toHaveBeenCalledWith("EPM-1", { points: 5 });
  });

  it("does not leak raw Jira error on 502 and logs it with logger (REF-010)", async () => {
    const sentinel = "UPSTREAM_JIRA_INTERNAL_UPDATE_DEADLOCK_LEAK";
    mocks.updateIssue.mockRejectedValueOnce(new Error(sentinel));

    const result = await recordEstimateDecision({
      key: "EPM-1",
      decision: "accepted",
      userId: "u-1",
      auth: { user: "alice", token: "tok", authMode: "Bearer" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).not.toContain(sentinel);
    }
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(sentinel),
      })
    );
  });
});
