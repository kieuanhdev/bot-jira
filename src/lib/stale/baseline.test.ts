import { describe, expect, it } from "vitest";
import { compareWithBaseline, POINT_BASELINE } from "./baseline";

describe("compareWithBaseline", () => {
  it("returns warning with null baseline when points is null", () => {
    const r = compareWithBaseline(null, 5);
    expect(r.level).toBe("warning");
    expect(r.baseline).toBeNull();
  });

  it("returns warning with null baseline when points is 0", () => {
    const r = compareWithBaseline(0, 5);
    expect(r.level).toBe("warning");
    expect(r.baseline).toBeNull();
  });

  it("returns warning with null baseline when point is not in table", () => {
    const r = compareWithBaseline(21, 5);
    expect(r.level).toBe("warning");
    expect(r.baseline).toBeNull();
  });

  it("returns within when cycle time ≤ expectedMax", () => {
    // 3 points: expectedMax = 2.5
    const r = compareWithBaseline(3, 2);
    expect(r.level).toBe("within");
    expect(r.baseline).toEqual(POINT_BASELINE.find((b) => b.point === 3));
  });

  it("returns within at exactly expectedMax", () => {
    // 5 points: expectedMax = 4
    const r = compareWithBaseline(5, 4);
    expect(r.level).toBe("within");
  });

  it("returns warning when cycle time between expectedMax and alertAbove", () => {
    // 5 points: expectedMax = 4, alertAbove = 6
    const r = compareWithBaseline(5, 5);
    expect(r.level).toBe("warning");
  });

  it("returns high when cycle time > alertAbove", () => {
    // 5 points: alertAbove = 6
    const r = compareWithBaseline(5, 7);
    expect(r.level).toBe("high");
  });

  it("returns high for 1 point at 2 days", () => {
    // 1 point: alertAbove = 1.5
    const r = compareWithBaseline(1, 2);
    expect(r.level).toBe("high");
  });

  it("returns within for 13 points at 6 days", () => {
    // 13 points: expectedMax = 9
    const r = compareWithBaseline(13, 6);
    expect(r.level).toBe("within");
  });
});
