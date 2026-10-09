import { describe, it, expect } from "vitest";
import { computePeriodBounds, parseLeaderboardParams } from "./period";

describe("Leaderboard Period Bounds & Parsing", () => {
  describe("computePeriodBounds", () => {
    it("computes month bounds accurately", () => {
      const period = computePeriodBounds("month", 2026, 10);
      expect(period.timeframe).toBe("month");
      expect(period.periodLabel).toBe("Tháng 10/2026");
      expect(period.year).toBe(2026);
      expect(period.month).toBe(10);
      expect(period.quarter).toBeNull();
      expect(period.startDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(period.endDate?.toISOString()).toBe("2026-10-31T23:59:59.999Z");
    });

    it("computes quarter bounds accurately", () => {
      const q4 = computePeriodBounds("quarter", 2026, undefined, 4);
      expect(q4.timeframe).toBe("quarter");
      expect(q4.periodLabel).toBe("Quý 4/2026");
      expect(q4.year).toBe(2026);
      expect(q4.month).toBeNull();
      expect(q4.quarter).toBe(4);
      expect(q4.startDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(q4.endDate?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    });

    it("computes year bounds accurately", () => {
      const year = computePeriodBounds("year", 2026);
      expect(year.timeframe).toBe("year");
      expect(year.periodLabel).toBe("Năm 2026");
      expect(year.year).toBe(2026);
      expect(year.month).toBeNull();
      expect(year.quarter).toBeNull();
      expect(year.startDate?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(year.endDate?.toISOString()).toBe("2026-12-31T23:59:59.999Z");
    });

    it("computes all-time bounds with null dates", () => {
      const all = computePeriodBounds("all", 2026);
      expect(all.timeframe).toBe("all");
      expect(all.periodLabel).toBe("Toàn bộ thời gian");
      expect(all.year).toBeNull();
      expect(all.month).toBeNull();
      expect(all.quarter).toBeNull();
      expect(all.startDate).toBeNull();
      expect(all.endDate).toBeNull();
      expect(all.isCurrentPeriod).toBe(true);
    });

    it("falls back to current year/month when out of range", () => {
      const invalidYear = computePeriodBounds("month", 1990, 15);
      const now = new Date();
      expect(invalidYear.year).toBe(now.getFullYear());
      expect(invalidYear.month).toBe(now.getMonth() + 1);
    });
  });

  describe("parseLeaderboardParams", () => {
    it("parses URLSearchParams correctly with valid values", () => {
      const params = new URLSearchParams({
        timeframe: "quarter",
        year: "2026",
        quarter: "3",
        project: "proj-a ",
      });

      const parsed = parseLeaderboardParams(params);
      expect(parsed).toEqual({
        timeframe: "quarter",
        year: 2026,
        month: undefined,
        quarter: 3,
        project: "PROJ-A",
      });
    });

    it("falls back to default month when timeframe is invalid", () => {
      const parsed = parseLeaderboardParams({ timeframe: "invalid" });
      expect(parsed.timeframe).toBe("month");
    });

    it("handles empty dictionary or null values safely", () => {
      const parsed = parseLeaderboardParams({});
      expect(parsed).toEqual({
        timeframe: "month",
        year: undefined,
        month: undefined,
        quarter: undefined,
        project: null,
      });
    });

    it("ignores non-finite numeric parameters", () => {
      const parsed = parseLeaderboardParams({
        year: "abc",
        month: "NaN",
        quarter: "invalid",
      });
      expect(parsed.year).toBeUndefined();
      expect(parsed.month).toBeUndefined();
      expect(parsed.quarter).toBeUndefined();
    });
  });
});
