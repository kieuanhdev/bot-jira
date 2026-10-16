import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminMetrics } from "./metrics";

const mocks = vi.hoisted(() => ({
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

describe("src/lib/admin/metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkerHealth.mockResolvedValue({
      status: "healthy",
      workerAgeMs: 5000,
      jiraSyncAgeMs: 60000,
      jobs: [],
    });
    mocks.isJiraFresh.mockReturnValue(true);
    mocks.outboxGroupBy.mockResolvedValue([{ state: "sent", _count: { _all: 10 } }]);
    mocks.sentryGroupBy.mockResolvedValue([{ state: "review", _count: { _all: 2 } }]);
    mocks.releaseGroupBy.mockResolvedValue([{ status: "active", _count: { _all: 1 } }]);
    mocks.gateResultsFindMany.mockResolvedValue([
      { gate: "unit_tests", state: "passed", createdAt: new Date() },
    ]);
    mocks.aiScoreCount.mockResolvedValue(15);
    mocks.aiDecisionGroupBy.mockResolvedValue([{ decision: "accepted", _count: { _all: 8 } }]);
    mocks.bulkOpGroupBy.mockResolvedValue([{ state: "completed", _count: { _all: 3 } }]);
    mocks.integrationEventGroupBy.mockResolvedValue([
      { source: "jira", _count: { _all: 100 } },
    ]);
    mocks.integrationEventFindMany.mockResolvedValue([
      { source: "jira", receivedAt: new Date("2026-10-16T10:00:00Z"), processingError: null },
    ]);
    mocks.startBoss.mockRejectedValue(new Error("pg-boss not started"));
  });

  it("aggregates metrics and serializes Dates to strings", async () => {
    const data = await getAdminMetrics();

    expect(data.worker.status).toBe("healthy");
    expect(data.worker.jiraFresh).toBe(true);
    expect(data.outbox.sent).toBe(10);
    expect(data.sentryImport.review).toBe(2);
    expect(data.releasesByStatus.active).toBe(1);
    expect(data.gatesByState.unit_tests.passed).toBe(1);
    expect(data.bulkOps.completed).toBe(3);
    expect(data.webhooks.jira.count24h).toBe(100);
    expect(data.ai.scores).toBe(15);
    expect(typeof data.generatedAt).toBe("string");
  });
});
