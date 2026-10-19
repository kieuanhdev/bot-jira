import { describe, expect, it } from "vitest";
import { isTerminalOpState, effectiveCountLabel } from "./bulk-utils";

describe("isTerminalOpState", () => {
  it.each(["completed", "partially_failed", "failed", "cancelled"])("%s is terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(true);
  });
  it.each(["queued", "running", "previewed", "", null, undefined])("%s is not terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(false);
  });
});

describe("effectiveCountLabel", () => {
  it("is exact in pick mode even when not fully loaded", () => {
    expect(effectiveCountLabel({ selectionMode: "pick", effectiveCount: 3, loadedCount: 1000, totalServerIssues: 2400 }))
      .toEqual({ label: "3", isLowerBound: false });
  });
  it("is a lower bound in filter mode when more issues exist on the server", () => {
    expect(effectiveCountLabel({ selectionMode: "filter", effectiveCount: 812, loadedCount: 1000, totalServerIssues: 2400 }))
      .toEqual({ label: "≥ 812", isLowerBound: true });
  });
  it("is exact in filter mode when everything is loaded", () => {
    expect(effectiveCountLabel({ selectionMode: "filter", effectiveCount: 40, loadedCount: 120, totalServerIssues: 120 }))
      .toEqual({ label: "40", isLowerBound: false });
  });
});

