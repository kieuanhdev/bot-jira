import { describe, it, expect, vi } from "vitest";
import { evaluateWorkerHeartbeat } from "./evaluate-worker-heartbeat";
import { runHealthCheck, fetchWorkerHeartbeatRow } from "../../../scripts/check-worker-health.mjs";

describe("evaluateWorkerHeartbeat", () => {
  const now = new Date("2026-09-30T10:00:00Z").getTime();

  it("reports healthy when heartbeat is recent (< 120s)", () => {
    const result = evaluateWorkerHeartbeat(
      { lastStartedAt: new Date(now - 30_000), lastSuccessAt: new Date(now - 30_000) },
      now
    );
    expect(result.healthy).toBe(true);
    expect(result.ageMs).toBe(30_000);
  });

  it("reports unhealthy when heartbeat is older than 120s", () => {
    const result = evaluateWorkerHeartbeat(
      { lastStartedAt: new Date(now - 130_000), lastSuccessAt: new Date(now - 130_000) },
      now
    );
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("stale");
    expect(result.ageMs).toBe(130_000);
  });

  it("reports unhealthy when timestamp is in the future beyond tolerance (> 15s)", () => {
    const result = evaluateWorkerHeartbeat(
      { lastStartedAt: new Date(now + 20_000), lastSuccessAt: new Date(now + 20_000) },
      now
    );
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("future");
  });

  it("allows slight clock drift in the future within tolerance (<= 15s)", () => {
    const result = evaluateWorkerHeartbeat(
      { lastStartedAt: new Date(now + 5_000), lastSuccessAt: new Date(now + 5_000) },
      now
    );
    expect(result.healthy).toBe(true);
    expect(result.ageMs).toBe(0);
  });

  it("reports unhealthy when no heartbeat row exists", () => {
    const result = evaluateWorkerHeartbeat(null, now);
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("No worker liveness heartbeat row found");
  });

  it("reports unhealthy when heartbeat row has null timestamps", () => {
    const result = evaluateWorkerHeartbeat({ lastStartedAt: null, lastSuccessAt: null }, now);
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("null timestamps");
  });

  it("reports unhealthy when heartbeat timestamp is invalid", () => {
    const result = evaluateWorkerHeartbeat({ lastStartedAt: "invalid-date", lastSuccessAt: null }, now);
    expect(result.healthy).toBe(false);
    expect(result.reason).toContain("Invalid heartbeat timestamp");
  });
});

describe("production check-worker-health database query & runHealthCheck", () => {
  it("fetches row and evaluates health check through client mock", async () => {
    const now = new Date("2026-09-30T10:00:00Z").getTime();
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [
          {
            lastStartedAt: new Date(now - 15_000),
            lastSuccessAt: new Date(now - 15_000),
          },
        ],
      }),
    };

    const evaluation = await runHealthCheck(mockClient, now);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE \"integration\" = 'worker' AND \"scope\" = 'liveness'")
    );
    expect(evaluation.healthy).toBe(true);
    expect(evaluation.ageMs).toBe(15_000);
  });

  it("returns unhealthy evaluation when database returns 0 rows", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const row = await fetchWorkerHeartbeatRow(mockClient);
    expect(row).toBeNull();

    const evaluation = await runHealthCheck(mockClient);
    expect(evaluation.healthy).toBe(false);
    expect(evaluation.reason).toContain("No worker liveness heartbeat row found");
  });

  it("propagates database query timeout or connection error", async () => {
    const mockClient = {
      query: vi.fn().mockRejectedValueOnce(new Error("Query read timeout")),
    };

    await expect(runHealthCheck(mockClient)).rejects.toThrow("Query read timeout");
  });
});
