import { describe, it, expect } from "vitest";
import { formatNumber, formatPercent } from "./number";

describe("formatNumber", () => {
  it("formats numbers using vi-VN locale by default", () => {
    expect(formatNumber(1234)).toBe((1234).toLocaleString("vi-VN"));
    expect(formatNumber(1000000)).toBe((1000000).toLocaleString("vi-VN"));
    expect(formatNumber(0)).toBe("0");
  });

  it("handles null, undefined and NaN cleanly with fallback", () => {
    expect(formatNumber(null)).toBe("0");
    expect(formatNumber(undefined)).toBe("0");
    expect(formatNumber(NaN)).toBe("0");
    expect(formatNumber(null, { fallback: "—" })).toBe("—");
  });

  it("supports custom locale override", () => {
    expect(formatNumber(1234.5, { locale: "en-US" })).toBe("1,234.5");
  });
});

describe("formatPercent", () => {
  it("formats decimal ratio to percentage", () => {
    expect(formatPercent(0.85)).toBe("85%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("formats pre-scaled percentage numbers", () => {
    expect(formatPercent(85)).toBe("85%");
    expect(formatPercent(100)).toBe("100%");
  });

  it("supports decimal digits option", () => {
    expect(formatPercent(0.855, { digits: 1 })).toBe("85,5%");
    expect(formatPercent(85.5, { digits: 1 })).toBe("85,5%");
  });

  it("handles null and undefined gracefully", () => {
    expect(formatPercent(null)).toBe("0%");
    expect(formatPercent(undefined)).toBe("0%");
  });
});
