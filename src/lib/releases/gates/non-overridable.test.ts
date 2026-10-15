import { describe, expect, it } from "vitest";
import {
  GATE_CI,
  GATE_NON_EMPTY,
  NON_OVERRIDABLE,
  NON_OVERRIDABLE_GATES,
} from "./non-overridable";

describe("NON_OVERRIDABLE release gates", () => {
  it("maintains the release safety invariant: exactly ci and non_empty_release", () => {
    expect(NON_OVERRIDABLE.size).toBe(2);
    expect(NON_OVERRIDABLE.has("ci")).toBe(true);
    expect(NON_OVERRIDABLE.has("non_empty_release")).toBe(true);
    expect(NON_OVERRIDABLE.has(GATE_CI)).toBe(true);
    expect(NON_OVERRIDABLE.has(GATE_NON_EMPTY)).toBe(true);
  });

  it("exports NON_OVERRIDABLE_GATES pointing to the same invariant set", () => {
    expect(NON_OVERRIDABLE_GATES).toBe(NON_OVERRIDABLE);
  });

  it("does not include overrideable gates", () => {
    expect(NON_OVERRIDABLE.has("task_status")).toBe(false);
    expect(NON_OVERRIDABLE.has("critical_bugs")).toBe(false);
    expect(NON_OVERRIDABLE.has("sentry")).toBe(false);
    expect(NON_OVERRIDABLE.has("ai_advisory")).toBe(false);
  });
});
