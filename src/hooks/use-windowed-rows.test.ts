import { describe, expect, it } from "vitest";
import { computeWindowedRange } from "./use-windowed-rows";

describe("computeWindowedRange", () => {
  it("does not window when totalRows <= threshold", () => {
    const result = computeWindowedRange({
      totalRows: 50,
      scrollTop: 100,
      clientHeight: 500,
      rowHeight: 40,
      threshold: 100,
    });

    expect(result.windowed).toBe(false);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(50);
    expect(result.padTop).toBe(0);
    expect(result.padBottom).toBe(0);
  });

  it("calculates correct startIdx, endIdx, and padding when windowed", () => {
    const result = computeWindowedRange({
      totalRows: 1000,
      scrollTop: 800, // row 20
      clientHeight: 400, // 10 rows
      rowHeight: 40,
      overscan: 5,
      threshold: 100,
    });

    expect(result.windowed).toBe(true);
    // Math.floor(800 / 40) - 5 = 20 - 5 = 15
    expect(result.startIdx).toBe(15);
    // Math.ceil((800 + 400) / 40) + 5 = 30 + 5 = 35
    expect(result.endIdx).toBe(35);
    expect(result.padTop).toBe(15 * 40);
    expect(result.padBottom).toBe((1000 - 35) * 40);
  });

  it("clamps startIdx to 0 and endIdx to totalRows", () => {
    // Near top
    const topResult = computeWindowedRange({
      totalRows: 500,
      scrollTop: 0,
      clientHeight: 200,
      rowHeight: 40,
      overscan: 10,
      threshold: 100,
    });
    expect(topResult.startIdx).toBe(0);
    expect(topResult.padTop).toBe(0);

    // Near bottom
    const bottomResult = computeWindowedRange({
      totalRows: 500,
      scrollTop: 19600, // row 490
      clientHeight: 400,
      rowHeight: 40,
      overscan: 20,
      threshold: 100,
    });
    expect(bottomResult.endIdx).toBe(500);
    expect(bottomResult.padBottom).toBe(0);
  });

  it("handles invalid rowHeight gracefully without dividing by zero", () => {
    const result = computeWindowedRange({
      totalRows: 500,
      scrollTop: 100,
      clientHeight: 500,
      rowHeight: 0,
      threshold: 100,
    });
    expect(result.windowed).toBe(false);
    expect(result.startIdx).toBe(0);
    expect(result.endIdx).toBe(500);
    expect(result.padTop).toBe(0);
    expect(result.padBottom).toBe(0);
  });
});
