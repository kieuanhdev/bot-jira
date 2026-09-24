import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { integrationCursor: { findMany: vi.fn() } },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/env", () => ({ env: { jiraFreshnessMinutes: 5 } }));

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
