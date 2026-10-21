import { describe, expect, it } from "vitest";
import { spikeOf, SPIKE_DELTA_MIN, SPIKE_PERCENT_MIN } from "./spike";

describe("spikeOf", () => {
  it("treats null or undefined baseline as new issue: hot if eventCount >= 50", () => {
    expect(spikeOf({ eventCount: 50, countBaseline: null })).toEqual({
      delta: 50,
      hot: true,
    });
    expect(spikeOf({ eventCount: 49, countBaseline: null })).toEqual({
      delta: 49,
      hot: false,
    });
    expect(spikeOf({ eventCount: 120, countBaseline: undefined })).toEqual({
      delta: 120,
      hot: true,
    });
  });

  it("treats baseline = 0 as new issue: hot if eventCount >= 50", () => {
    expect(spikeOf({ eventCount: 50, countBaseline: 0 })).toEqual({
      delta: 50,
      hot: true,
    });
    expect(spikeOf({ eventCount: 30, countBaseline: 0 })).toEqual({
      delta: 30,
      hot: false,
    });
  });

  it("handles null or negative eventCount safely", () => {
    expect(spikeOf({ eventCount: null, countBaseline: null })).toEqual({
      delta: 0,
      hot: false,
    });
    expect(spikeOf({ eventCount: undefined, countBaseline: 10 })).toEqual({
      delta: 0,
      hot: false,
    });
    expect(spikeOf({ eventCount: -5, countBaseline: 0 })).toEqual({
      delta: 0,
      hot: false,
    });
  });

  it("flags hot when delta >= 50 and delta >= 50% baseline", () => {
    // baseline = 100, eventCount = 150 -> delta = 50 (50% of 100) -> hot
    expect(spikeOf({ eventCount: 150, countBaseline: 100 })).toEqual({
      delta: 50,
      hot: true,
    });

    // baseline = 60, eventCount = 120 -> delta = 60 (100% of 60 >= 50%) -> hot
    expect(spikeOf({ eventCount: 120, countBaseline: 60 })).toEqual({
      delta: 60,
      hot: true,
    });
  });

  it("does not flag hot if delta < 50 even if percentage >= 50%", () => {
    // baseline = 20, eventCount = 60 -> delta = 40 (200% of baseline, but < 50) -> not hot
    expect(spikeOf({ eventCount: 60, countBaseline: 20 })).toEqual({
      delta: 40,
      hot: false,
    });
  });

  it("does not flag hot if percentage < 50% even if delta >= 50", () => {
    // baseline = 200, eventCount = 260 -> delta = 60 (30% of baseline, < 50%) -> not hot
    expect(spikeOf({ eventCount: 260, countBaseline: 200 })).toEqual({
      delta: 60,
      hot: false,
    });
  });

  it("handles eventCount lower than baseline gracefully (delta = 0)", () => {
    expect(spikeOf({ eventCount: 80, countBaseline: 100 })).toEqual({
      delta: 0,
      hot: false,
    });
  });

  it("exports named constants for easy tuning", () => {
    expect(SPIKE_DELTA_MIN).toBe(50);
    expect(SPIKE_PERCENT_MIN).toBe(0.5);
  });
});
