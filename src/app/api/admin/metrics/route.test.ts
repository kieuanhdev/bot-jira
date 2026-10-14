import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getWorkerHealth: vi.fn(),
  isJiraFresh: vi.fn(),
  outboxGroupBy: vi.fn(),
  sentryGroupBy: vi.fn(),
  releaseGroupBy: vi.fn(),
  gateResultsFindMany: vi.fn(),
  aiScoreCount: vi.fn(),
  aiDecisionGroupBy: vi.fn(),
  bulkOpGroupBy: vi.fn(),
  integrationEventGroupBy: vi.fn(),
  integrationEventFindMany: vi.fn(),
  startBoss: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
}));

vi.mock("@/lib/health/worker-health", () => ({
  getWorkerHealth: mocks.getWorkerHealth,
  isJiraFresh: mocks.isJiraFresh,
}));

vi.mock("@/lib/queue/boss", () => ({
  startBoss: mocks.startBoss,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationOutbox: { groupBy: mocks.outboxGroupBy },
    sentryIssueImported: { groupBy: mocks.sentryGroupBy },
    release: { groupBy: mocks.releaseGroupBy },
    releaseGateResult: { findMany: mocks.gateResultsFindMany },
    aiScore: { count: mocks.aiScoreCount },
    aiEstimateDecision: { groupBy: mocks.aiDecisionGroupBy },
    bulkOperation: { groupBy: mocks.bulkOpGroupBy },
    integrationEvent: {
      groupBy: mocks.integrationEventGroupBy,
      findMany: mocks.integrationEventFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/admin/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({
      user: { id: "admin-1", role: "admin" },
    });
    mocks.getWorkerHealth.mockResolvedValue({
      status: "healthy",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 60000,
      jobs: [],
    });
    mocks.isJiraFresh.mockReturnValue(true);

    mocks.outboxGroupBy.mockResolvedValue([{ state: "pending", _count: { _all: 5 } }]);
    mocks.sentryGroupBy.mockResolvedValue([{ state: "failed", _count: { _all: 2 } }]);
    mocks.releaseGroupBy.mockResolvedValue([{ status: "open", _count: { _all: 3 } }]);
    mocks.gateResultsFindMany.mockResolvedValue([
      { gate: "ci", state: "passed", createdAt: new Date() },
    ]);
    mocks.aiScoreCount.mockResolvedValue(10);
    mocks.aiDecisionGroupBy.mockResolvedValue([{ decision: "accepted", _count: { _all: 8 } }]);
    mocks.bulkOpGroupBy.mockResolvedValue([{ state: "completed", _count: { _all: 4 } }]);
    mocks.integrationEventGroupBy.mockResolvedValue([
      { source: "jira", _count: { _all: 25 } },
    ]);
    mocks.integrationEventFindMany.mockResolvedValue([
      { source: "jira", receivedAt: new Date("2026-10-14T09:00:00Z"), processingError: null },
    ]);
    mocks.startBoss.mockResolvedValue({
      getQueues: vi.fn().mockResolvedValue([
        { name: "deliver-notifications", queuedCount: 0, readyCount: 2, activeCount: 1, failedCount: 0 },
      ]),
    });
  });

  it("rejects unauthorized users", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
    expect((await GET()).status).toBe(403);
  });

  it("returns comprehensive metrics including webhooks, queues, bulkOps, and gates", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.outbox).toEqual({ pending: 5 });
    expect(data.sentryImport).toEqual({ failed: 2 });
    expect(data.releasesByStatus).toEqual({ open: 3 });
    expect(data.gatesByState.ci).toEqual({ passed: 1, failed: 0, unknown: 0, overridden: 0 });
    expect(data.bulkOps).toEqual({ completed: 4 });
    expect(data.webhooks.jira).toBeDefined();
    expect(data.webhooks.jira.source).toBe("jira");
    expect(data.queues).toHaveLength(1);
    expect(data.queues[0].name).toBe("deliver-notifications");
    expect(data.ai.scores).toBe(10);
  });

  it("gracefully falls back to queues: null if pg-boss getQueues throws", async () => {
    mocks.startBoss.mockRejectedValue(new Error("Queue error"));
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.queues).toBeNull();
  });
});
