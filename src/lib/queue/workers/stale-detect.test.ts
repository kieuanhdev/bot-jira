import { describe, expect, it } from "vitest";
import { runStaleDetect } from "./stale-detect";

describe("stale-detect worker", () => {
  it("skips execution outside business hours (e.g. at 00:00 midnight)", async () => {
    // 00:00 VN Monday (17:00 UTC Sunday)
    const midnightRun = await runStaleDetect(new Date("2026-11-01T17:00:00Z"));
    expect(midnightRun.ok).toBe(true);
    expect(midnightRun.skipped).toBe(true);
    expect(midnightRun.reason).toBe("outside_working_hours");
  });

  it("skips execution on weekends (e.g. Saturday 10:00 AM)", async () => {
    // 10:00 VN Saturday (03:00 UTC Saturday)
    const weekendRun = await runStaleDetect(new Date("2026-11-07T03:00:00Z"));
    expect(weekendRun.ok).toBe(true);
    expect(weekendRun.skipped).toBe(true);
    expect(weekendRun.reason).toBe("outside_working_hours");
  });
});
