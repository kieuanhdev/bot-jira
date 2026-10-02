import { describe, it, expect } from "vitest";
import { getTier, getNextTier, LEADERBOARD_TIERS, computePeriodBounds } from "./types";

describe("Leaderboard Tier System", () => {
  it("resolves correct tier based on story points", () => {
    expect(getTier(0).name).toBe("Phàm Nhân");
    expect(getTier(1).name).toBe("Luyện Khí • Sơ Kỳ");
    expect(getTier(2).name).toBe("Luyện Khí • Sơ Kỳ");
    expect(getTier(3).name).toBe("Luyện Khí • Trung Kỳ");
    expect(getTier(6).name).toBe("Luyện Khí • Hậu Kỳ");
    expect(getTier(9).name).toBe("Luyện Khí • Đại Viên Mãn");
    expect(getTier(13).name).toBe("Trúc Cơ • Sơ Kỳ");
    expect(getTier(19).name).toBe("Trúc Cơ • Trung Kỳ");
    expect(getTier(26).name).toBe("Trúc Cơ • Hậu Kỳ");
    expect(getTier(34).name).toBe("Trúc Cơ • Đại Viên Mãn");
    expect(getTier(44).name).toBe("Kết Đan • Sơ Kỳ");
    expect(getTier(58).name).toBe("Kết Đan • Trung Kỳ");
    expect(getTier(75).name).toBe("Kết Đan • Hậu Kỳ");
    expect(getTier(95).name).toBe("Kết Đan • Đại Viên Mãn");
    expect(getTier(120).name).toBe("Nguyên Anh • Sơ Kỳ");
    expect(getTier(195).name).toBe("Nguyên Anh • Hậu Kỳ");
    expect(getTier(290).name).toBe("Hóa Thần • Sơ Kỳ");
    expect(getTier(500).name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
    expect(getTier(600).name).toBe("Hóa Thần • Đỉnh Phong (Phi Thăng)");
  });

  it("calculates progress to next tier accurately", () => {
    // 0 points -> next tier is Luyện Khí Sơ Kỳ (1 pt)
    const rookieNext = getNextTier(0);
    expect(rookieNext?.nextTier.name).toBe("Luyện Khí • Sơ Kỳ");
    expect(rookieNext?.pointsNeeded).toBe(1);

    // 15 points -> Trúc Cơ Sơ Kỳ (13-18), next is Trúc Cơ Trung Kỳ (19 pts)
    const trucCoNext = getNextTier(15);
    expect(trucCoNext?.nextTier.name).toBe("Trúc Cơ • Trung Kỳ");
    expect(trucCoNext?.pointsNeeded).toBe(4);
    expect(trucCoNext?.progressPercent).toBe(33);

    // 600 points -> Hóa Thần Đỉnh Phong (500+), already highest tier
    const legendNext = getNextTier(600);
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

describe("Leaderboard Monthly Task Completion Logic", () => {
  const period = computePeriodBounds("month", 2026, 9); // Tháng 9/2026

  function shouldIncludeTaskInPeriod(
    statusCategory: string,
    statusChangedAt: Date | null,
    rawResolutionDate: string | null,
    updatedAt: Date | null,
    createdAt: Date | null,
    timeframe: "month" | "all",
    isCurrentPeriod = false
  ): boolean {
    const isDone = statusCategory.toLowerCase() === "done";
    const rawRes = rawResolutionDate ? new Date(rawResolutionDate) : null;
    const completionDate = statusChangedAt ?? rawRes ?? updatedAt ?? createdAt;

    if (isDone) {
      if (!period.startDate || !period.endDate) return true;
      return Boolean(
        completionDate &&
        completionDate.getTime() >= period.startDate.getTime() &&
        completionDate.getTime() <= period.endDate.getTime()
      );
    }

    // In-progress tasks (bế quan) are tracked for the current period or in "all" timeframe
    return isCurrentPeriod || timeframe === "all";
  }

  it("includes task completed within target month", () => {
    const doneInSep = new Date("2026-09-15T10:00:00.000Z");
    const included = shouldIncludeTaskInPeriod("done", doneInSep, null, doneInSep, doneInSep, "month", false);
    expect(included).toBe(true);
  });

  it("excludes task completed in previous month even if updated in current month", () => {
    const doneInAug = new Date("2026-08-25T10:00:00.000Z");
    const updatedInSep = new Date("2026-09-05T10:00:00.000Z"); // Commented or re-synced in Sep
    const included = shouldIncludeTaskInPeriod("done", doneInAug, null, updatedInSep, doneInAug, "month", false);
    expect(included).toBe(false);
  });

  it("includes in-progress task for current period as bế quan points", () => {
    const statusChangedInSep = new Date("2026-09-10T10:00:00.000Z");
    const includedInCurrent = shouldIncludeTaskInPeriod(
      "indeterminate",
      statusChangedInSep,
      null,
      statusChangedInSep,
      statusChangedInSep,
      "month",
      true
    );
    expect(includedInCurrent).toBe(true);

    const includedInPast = shouldIncludeTaskInPeriod(
      "indeterminate",
      statusChangedInSep,
      null,
      statusChangedInSep,
      statusChangedInSep,
      "month",
      false
    );
    expect(includedInPast).toBe(false);
  });

  it("prioritizes resolutiondate when statusChangedAt is null", () => {
    const updatedInOct = new Date("2026-10-01T10:00:00.000Z");
    const resolvedInSep = "2026-09-20T10:00:00.000Z";
    const included = shouldIncludeTaskInPeriod("done", null, resolvedInSep, updatedInOct, null, "month");
    expect(included).toBe(true);
  });
});

