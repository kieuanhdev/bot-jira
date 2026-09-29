import { describe, it, expect } from "vitest";
import { computeReleaseSummary } from "./release-summary";

describe("release-summary", () => {
  it("enforces totalActive = inProgress + ready + empty + released invariant", () => {
    const items = [
      { id: "1", archived: false, jiraReleased: true, taskCount: 5, deliveryReadyCount: 5 },
      { id: "2", archived: false, jiraReleased: true, taskCount: 0, deliveryReadyCount: 0 },
      { id: "3", archived: false, jiraReleased: false, taskCount: 0, deliveryReadyCount: 0 },
      { id: "4", archived: false, jiraReleased: false, taskCount: 4, deliveryReadyCount: 4 },
      { id: "5", archived: false, jiraReleased: false, taskCount: 3, deliveryReadyCount: 2 },
      { id: "6", archived: false, jiraReleased: false, taskCount: 1, deliveryReadyCount: 0 },
      { id: "7", archived: true, jiraReleased: false, taskCount: 2, deliveryReadyCount: 1 },
      { id: "8", archived: true, jiraReleased: true, taskCount: 5, deliveryReadyCount: 5 },
    ];

    const summary = computeReleaseSummary(items);
    expect(summary.totalActive).toBe(6);
    expect(summary.released).toBe(2);
    expect(summary.empty).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.inProgress).toBe(2);
    expect(summary.archived).toBe(2);
    expect(summary.totalActive).toBe(
      summary.inProgress + summary.ready + summary.empty + summary.released
    );
  });
});
