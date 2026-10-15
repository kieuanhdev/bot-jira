import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with promise value when promise completes before timeout", async () => {
    const promise = Promise.resolve("success");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("success");
  });

  it("rejects when promise rejects before timeout", async () => {
    const promise = Promise.reject(new Error("boom"));
    await expect(withTimeout(promise, 1000)).rejects.toThrow("boom");
  });

  it("resolves with 'timeout' when promise exceeds timeout ms", async () => {
    const hangingPromise = new Promise((resolve) => {
      // never resolves or takes 5000ms
      setTimeout(() => resolve("late"), 5000);
    });

    const timeoutResultPromise = withTimeout(hangingPromise, 1000);

    vi.advanceTimersByTime(1001);

    const result = await timeoutResultPromise;
    expect(result).toBe("timeout");
  });
});
