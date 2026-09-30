import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { integrationCursor: { findMany: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({
  env: { jiraFreshnessMinutes: 5 },
  jiraProjectList: [],
}));

import { getWorkerHealth, isJiraFresh } from "./worker-health";

const now = Date.now();
const ago = (ms: number) => new Date(now - ms);

function rows(r: Record<string, unknown>[]) {
  prismaMock.integrationCursor.findMany.mockResolvedValue(r);
}

beforeEach(() => vi.clearAllMocks());

describe("getWorkerHealth", () => {
  it("is unknown on a brand-new install (no cursor rows)", async () => {
    rows([]);
    const h = await getWorkerHealth();
    expect(h.status).toBe("unknown");
    expect(isJiraFresh(h)).toBe(false);
  });

  it("is healthy when liveness and jira sync are both fresh", async () => {
    rows([
      { scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { scope: "poll-jira", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
    ]);
    const h = await getWorkerHealth();
    expect(h.status).toBe("healthy");
    expect(isJiraFresh(h)).toBe(true);
  });

  it("is down when the liveness heartbeat is older than the 2-minute threshold", async () => {
    rows([
      { scope: "liveness", lastStartedAt: ago(3 * 60_000), lastSuccessAt: ago(3 * 60_000), lastErrorAt: null, lastError: null, stats: null },
      { scope: "poll-jira", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
    ]);
    const h = await getWorkerHealth();
    expect(h.status).toBe("down");
  });

  it("is degraded when Jira sync is stale (> 5 min) but the worker is alive", async () => {
    rows([
      { scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { scope: "poll-jira", lastStartedAt: ago(1000), lastSuccessAt: ago(6 * 60_000), lastErrorAt: null, lastError: null, stats: null },
    ]);
    const h = await getWorkerHealth();
    expect(h.status).toBe("degraded");
    expect(isJiraFresh(h)).toBe(false);
  });

  it("is degraded when a job reported an error after its last success", async () => {
    rows([
      { scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { scope: "poll-jira", lastStartedAt: ago(1000), lastSuccessAt: ago(5000), lastErrorAt: ago(1000), lastError: "boom", stats: null },
    ]);
    const h = await getWorkerHealth();
    expect(h.status).toBe("degraded");
    expect(h.hasErrors).toBe(true);
  });
});

describe("getWorkerHealth with per-project Jira cursors", () => {
  it("derives degraded status and tracks staleProjects when a project is missing or stale", async () => {
    const { jiraProjectList } = await import("@/lib/env");
    jiraProjectList.push("EPM", "MR");

    rows([
      { integration: "worker", scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      // EPM is fresh (1 min ago)
      { integration: "jira", scope: "EPM", lastStartedAt: ago(60_000), lastSuccessAt: ago(60_000), lastErrorAt: null, lastError: null, stats: null },
      // MR is stale (7 min ago)
      { integration: "jira", scope: "MR", lastStartedAt: ago(7 * 60_000), lastSuccessAt: ago(7 * 60_000), lastErrorAt: null, lastError: null, stats: null },
    ]);

    const h = await getWorkerHealth();
    expect(h.status).toBe("degraded");
    expect(h.staleProjects).toEqual(["MR"]);
    // jiraSyncAgeMs uses oldest success (MR ~ 7m)
    expect(h.jiraSyncAgeMs).toBeGreaterThanOrEqual(6 * 60_000);
    expect(isJiraFresh(h)).toBe(false);

    // Clean up
    jiraProjectList.length = 0;
  });

  it("derives failingProjects and hasErrors when a project has an error newer than success", async () => {
    const { jiraProjectList } = await import("@/lib/env");
    jiraProjectList.push("EPM", "CICM");

    rows([
      { integration: "worker", scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      // EPM is fresh and ok
      { integration: "jira", scope: "EPM", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      // CICM has recent error
      { integration: "jira", scope: "CICM", lastStartedAt: ago(2000), lastSuccessAt: ago(60_000), lastErrorAt: ago(1000), lastError: "Jira 401", stats: null },
    ]);

    const h = await getWorkerHealth();
    expect(h.status).toBe("degraded");
    expect(h.hasErrors).toBe(true);
    expect(h.failingProjects).toEqual(["CICM"]);

    // Clean up
    jiraProjectList.length = 0;
  });

  it("marks all 8 projects stale when 8 projects are configured and zero Jira cursors exist", async () => {
    const { jiraProjectList } = await import("@/lib/env");
    const eightProjects = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
    jiraProjectList.push(...eightProjects);

    // Only worker liveness exists, zero Jira cursors in DB
    rows([
      { integration: "worker", scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
    ]);

    const h = await getWorkerHealth();
    expect(h.staleProjects).toHaveLength(8);
    expect(h.staleProjects).toEqual(eightProjects);
    expect(h.status).toBe("degraded");
    expect(isJiraFresh(h)).toBe(false);

    jiraProjectList.length = 0;
  });

  it("marks exactly one project stale when one cursor is missing", async () => {
    const { jiraProjectList } = await import("@/lib/env");
    jiraProjectList.push("P1", "P2", "P3");

    rows([
      { integration: "worker", scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { integration: "jira", scope: "P1", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { integration: "jira", scope: "P2", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      // P3 has no cursor row
    ]);

    const h = await getWorkerHealth();
    expect(h.staleProjects).toEqual(["P3"]);
    expect(h.status).toBe("degraded");

    jiraProjectList.length = 0;
  });

  it("marks project stale when cursor exists but lastSuccessAt is null", async () => {
    const { jiraProjectList } = await import("@/lib/env");
    jiraProjectList.push("P1");

    rows([
      { integration: "worker", scope: "liveness", lastStartedAt: ago(1000), lastSuccessAt: ago(1000), lastErrorAt: null, lastError: null, stats: null },
      { integration: "jira", scope: "P1", lastStartedAt: ago(1000), lastSuccessAt: null, lastErrorAt: null, lastError: null, stats: null },
    ]);

    const h = await getWorkerHealth();
    expect(h.staleProjects).toEqual(["P1"]);
    expect(h.status).toBe("degraded");

    jiraProjectList.length = 0;
  });

  it("does not report healthy when database query throws error", async () => {
    prismaMock.integrationCursor.findMany.mockRejectedValueOnce(new Error("Connection refused"));

    const h = await getWorkerHealth();
    expect(h.status).toBe("down");
    expect(h.hasErrors).toBe(true);
    expect(h.databaseError).toContain("Connection refused");
    expect(isJiraFresh(h)).toBe(false);
  });
});
