import type { BoardSyncState } from "./board-types";

export interface BoardSyncStatusResponse {
  projectKey: string;
  state: "queued" | "running" | "succeeded" | "failed" | "unknown";
  lastError: string | null;
}

export type BoardSyncPollOutcome =
  | { kind: "continue"; state: "queued" | "running"; delayMs: number }
  | { kind: "succeeded" }
  | { kind: "failed"; error: string };

export function boardSyncPollDelay(elapsedMs: number): number {
  return elapsedMs < 15_000 ? 1000 : 2500;
}

export function resolveBoardSyncPoll(
  response: BoardSyncStatusResponse,
  elapsedMs: number
): BoardSyncPollOutcome {
  if (response.state === "succeeded") return { kind: "succeeded" };
  if (response.state === "failed") {
    return {
      kind: "failed",
      error: response.lastError ? response.lastError.slice(0, 100) : "Lỗi đồng bộ",
    };
  }
  return {
    kind: "continue",
    state: response.state === "running" ? "running" : "queued",
    delayMs: boardSyncPollDelay(elapsedMs),
  };
}

export function isBoardSyncBusy(state: BoardSyncState): boolean {
  return state === "enqueueing" || state === "queued" || state === "running";
}
