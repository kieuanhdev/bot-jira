import { describe, expect, it } from "vitest";
import { boardSyncPollDelay, isBoardSyncBusy, resolveBoardSyncPoll } from "./board-sync-model";

describe("board sync polling model", () => {
  it("polls quickly for the first 15 seconds, then backs off", () => {
    expect(boardSyncPollDelay(14_999)).toBe(1000);
    expect(boardSyncPollDelay(15_000)).toBe(2500);
  });

  it("normalizes queued and unknown provider states to continued polling", () => {
    expect(
      resolveBoardSyncPoll({ projectKey: "EPM", state: "unknown", lastError: null }, 20_000)
    ).toEqual({ kind: "continue", state: "queued", delayMs: 2500 });
    expect(
      resolveBoardSyncPoll({ projectKey: "EPM", state: "running", lastError: null }, 1_000)
    ).toEqual({ kind: "continue", state: "running", delayMs: 1000 });
  });

  it("returns terminal success and a bounded failure message", () => {
    expect(
      resolveBoardSyncPoll({ projectKey: "EPM", state: "succeeded", lastError: null }, 1_000)
    ).toEqual({ kind: "succeeded" });
    const outcome = resolveBoardSyncPoll(
      { projectKey: "EPM", state: "failed", lastError: "x".repeat(150) },
      1_000
    );
    expect(outcome).toEqual({ kind: "failed", error: "x".repeat(100) });
  });

  it("treats only enqueueing, queued, and running as busy", () => {
    expect(["enqueueing", "queued", "running"].every((state) => isBoardSyncBusy(state as never))).toBe(true);
    expect(["idle", "succeeded", "failed"].some((state) => isBoardSyncBusy(state as never))).toBe(false);
  });
});
