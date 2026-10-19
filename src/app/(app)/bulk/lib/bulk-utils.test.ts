import { describe, expect, it } from "vitest";
import { isTerminalOpState } from "./bulk-utils";

describe("isTerminalOpState", () => {
  it.each(["completed", "partially_failed", "failed", "cancelled"])("%s is terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(true);
  });
  it.each(["queued", "running", "previewed", "", null, undefined])("%s is not terminal", (s) => {
    expect(isTerminalOpState(s)).toBe(false);
  });
});
