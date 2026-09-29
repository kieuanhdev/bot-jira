import { describe, it, expect } from "vitest";
import { getTier, getNextTier, LEADERBOARD_TIERS, computePeriodBounds } from "./types";

describe("Leaderboard Tier System", () => {
  it("resolves correct tier based on story points", () => {
    expect(getTier(0).name).toBe("Tân Binh");
    expect(getTier(5).name).toBe("Đồng");
    expect(getTier(10).name).toBe("Bạc");
    expect(getTier(19).name).toBe("Bạc");
    expect(getTier(20).name).toBe("Vàng");
    expect(getTier(30).name).toBe("Kim Cương");
    expect(getTier(50).name).toBe("Huyền Thoại");
    expect(getTier(100).name).toBe("Huyền Thoại");
  });

  it("calculates progress to next tier accurately", () => {
    // 0 points -> next tier is Bronze (1 pt)
    const rookieNext = getNextTier(0);
    expect(rookieNext?.nextTier.name).toBe("Đồng");
    expect(rookieNext?.pointsNeeded).toBe(1);

    // 15 points -> Silver (10-19), next tier is Gold (20)
    const silverNext = getNextTier(15);
    expect(silverNext?.nextTier.name).toBe("Vàng");
    expect(silverNext?.pointsNeeded).toBe(5);
    expect(silverNext?.progressPercent).toBe(50);

    // 60 points -> Legend (50+), already highest tier
    const legendNext = getNextTier(60);
    expect(legendNext?.progressPercent).toBe(100);
    expect(legendNext?.pointsNeeded).toBe(0);
  });
});

describe("Leaderboard Period Bounds", () => {
  it("computes month bounds correctly", () => {
    const period = computePeriodBounds("month", 2026, 9);
    expect(period.timeframe).toBe("month");
    expect(period.periodLabel).toBe("Tháng 9/2026");
    expect(period.startDate?.toISOString().startsWith("2026-09-01")).toBe(true);
    expect(period.endDate?.toISOString().startsWith("2026-09-30")).toBe(true);
  });

  it("computes quarter bounds correctly", () => {
    const q3 = computePeriodBounds("quarter", 2026, undefined, 3);
    expect(q3.timeframe).toBe("quarter");
    expect(q3.periodLabel).toBe("Quý 3/2026");
    // Q3 is Jul 1 - Sep 30
    expect(q3.startDate?.toISOString().startsWith("2026-07-01")).toBe(true);
    expect(q3.endDate?.toISOString().startsWith("2026-09-30")).toBe(true);
  });

  it("computes year bounds correctly", () => {
    const year = computePeriodBounds("year", 2026);
    expect(year.timeframe).toBe("year");
    expect(year.periodLabel).toBe("Năm 2026");
    expect(year.startDate?.toISOString().startsWith("2026-01-01")).toBe(true);
    expect(year.endDate?.toISOString().startsWith("2026-12-31")).toBe(true);
  });

  it("computes all-time bounds correctly", () => {
    const all = computePeriodBounds("all", 2026);
    expect(all.timeframe).toBe("all");
    expect(all.startDate).toBeNull();
    expect(all.endDate).toBeNull();
  });
});
