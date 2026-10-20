import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  isAdmin: vi.fn(),
  prismaQueryRaw: vi.fn(),
  getWorkerHealth: vi.fn(),
  isJiraFresh: vi.fn(),
  hasJiraCredentials: vi.fn(),
  jiraMe: vi.fn(),
  hasBitbucketConfig: vi.fn(),
  hasSentryConfig: vi.fn(),
  hasOpenAiConfig: vi.fn(),
  getJobSchedules: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock("@/lib/async/with-timeout", () => ({
  withTimeout: (p: Promise<unknown>, ms: number) => mocks.withTimeout(p, ms),
}));


vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: mocks.isAdmin,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mocks.prismaQueryRaw,
  },
}));

vi.mock("@/lib/health/worker-health", () => ({
  getWorkerHealth: mocks.getWorkerHealth,
  isJiraFresh: mocks.isJiraFresh,
}));

vi.mock("@/lib/jira/client", () => ({
  hasJiraCredentials: mocks.hasJiraCredentials,
  jira: { me: mocks.jiraMe },
}));

vi.mock("@/lib/bitbucket/client", () => ({
  bitbucket: { repos: () => [], listBranches: vi.fn() },
}));

vi.mock("@/lib/sentry/client", () => ({
  sentry: { listUnresolvedIssues: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
  env: { pollIntervalMs: 60000 },
  hasBitbucketConfig: mocks.hasBitbucketConfig,
  hasSentryConfig: mocks.hasSentryConfig,
  hasOpenAiConfig: mocks.hasOpenAiConfig,
}));

vi.mock("@/lib/queue/schedules", () => ({
  getJobSchedules: mocks.getJobSchedules,
}));

import { GET } from "./route";
import { clearProbeCache } from "@/lib/health/ping-cache";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearProbeCache();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.isAdmin.mockReturnValue(true);
    mocks.prismaQueryRaw.mockResolvedValue([{ 1: 1 }]);
    mocks.getWorkerHealth.mockResolvedValue({
      status: "healthy",
      workerAgeMs: 1000,
      jiraSyncAgeMs: 2000,
      hasErrors: false,
      jobs: [],
    });
    mocks.isJiraFresh.mockReturnValue(true);
    mocks.hasJiraCredentials.mockResolvedValue(true);
    mocks.jiraMe.mockResolvedValue({ name: "JiraBot" });
    mocks.hasBitbucketConfig.mockReturnValue(false);
    mocks.hasSentryConfig.mockReturnValue(false);
    mocks.hasOpenAiConfig.mockReturnValue(false);
    mocks.getJobSchedules.mockReturnValue({});
    mocks.withTimeout.mockImplementation((p: Promise<unknown>) => p);
  });

  it("returns 403 when user is not admin", async () => {
    mocks.isAdmin.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 and services with latency history", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe("ok");
    expect(data.services.db).toBeDefined();
    expect(data.services.db.ok).toBe(true);
    expect(typeof data.services.db.ms).toBe("number");
    expect(Array.isArray(data.services.db.history)).toBe(true);
    expect(data.services.db.history.length).toBeGreaterThanOrEqual(1);

    expect(data.services.jira.ok).toBe(true);
    expect(Array.isArray(data.services.jira.history)).toBe(true);
  });

  it("executes service pings in parallel (time ≈ max, not sum)", async () => {
    // Both take 40ms
    mocks.prismaQueryRaw.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([{ 1: 1 }]), 40))
    );
    mocks.jiraMe.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ name: "JiraBot" }), 40))
    );

    const start = Date.now();
    const res = await GET();
    const duration = Date.now() - start;

    expect(res.status).toBe(200);
    // If sequential, duration >= 80ms. In parallel, duration < 75ms.
    expect(duration).toBeLessThan(75);
  });

  it("handles ping timeout gracefully without failing the entire response", async () => {
    mocks.withTimeout.mockImplementation(async (p: Promise<unknown>) => {
      const val = await p;
      if (val && typeof val === "object" && "name" in (val as Record<string, unknown>)) {
        return "timeout";
      }
      return val;
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.services.jira.ok).toBe(false);
    expect(data.services.jira.error).toContain("timeout");
  });
});


