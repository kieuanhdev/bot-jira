import { describe, it, expect } from "vitest";
import {
  resolveReportPeriod,
  countDays,
  getPeriodDisplayLabel,
  getAdjacentPeriod,
} from "./period";

describe("period utilities", () => {
  // 2026-10-03 is a Saturday (Tuần 40, Monday 2026-09-28 to Sunday 2026-10-04)
  const refDate = new Date("2026-10-03T10:00:00Z");

  it("calculates this_week correctly starting on Monday and ending on Sunday", () => {
    const { period, comparisonPeriod } = resolveReportPeriod({
      period: "this_week",
      timezone: "Asia/Ho_Chi_Minh",
      now: refDate,
    });

    expect(period.preset).toBe("this_week");
    expect(period.from).toBe("2026-09-28");
    expect(period.to).toBe("2026-10-04");
    expect(countDays(period.from, period.to)).toBe(7);

    // Comparison period should be exactly 7 days prior
    expect(comparisonPeriod.from).toBe("2026-09-21");
    expect(comparisonPeriod.to).toBe("2026-09-27");
    expect(countDays(comparisonPeriod.from, comparisonPeriod.to)).toBe(7);
  });

  it("calculates last_week correctly", () => {
    const { period, comparisonPeriod } = resolveReportPeriod({
      period: "last_week",
      timezone: "Asia/Ho_Chi_Minh",
      now: refDate,
    });

    expect(period.preset).toBe("last_week");
    expect(period.from).toBe("2026-09-21");
    expect(period.to).toBe("2026-09-27");
    expect(comparisonPeriod.from).toBe("2026-09-14");
    expect(comparisonPeriod.to).toBe("2026-09-20");
  });

  it("calculates this_month and last_month correctly", () => {
    const thisMonth = resolveReportPeriod({
      period: "this_month",
      timezone: "Asia/Ho_Chi_Minh",
      now: refDate,
    });

    expect(thisMonth.period.from).toBe("2026-10-01");
    expect(thisMonth.period.to).toBe("2026-10-31");
    expect(countDays(thisMonth.period.from, thisMonth.period.to)).toBe(31);
    expect(countDays(thisMonth.comparisonPeriod.from, thisMonth.comparisonPeriod.to)).toBe(31);

    const lastMonth = resolveReportPeriod({
      period: "last_month",
      timezone: "Asia/Ho_Chi_Minh",
      now: refDate,
    });

    expect(lastMonth.period.from).toBe("2026-09-01");
    expect(lastMonth.period.to).toBe("2026-09-30");
    expect(countDays(lastMonth.period.from, lastMonth.period.to)).toBe(30);
  });

  it("handles custom date range and validates boundaries", () => {
    const valid = resolveReportPeriod({
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-15",
    });

    expect(valid.period.preset).toBe("custom");
    expect(valid.period.from).toBe("2026-08-01");
    expect(valid.period.to).toBe("2026-08-15");
    expect(countDays(valid.period.from, valid.period.to)).toBe(15);
    expect(valid.comparisonPeriod.to).toBe("2026-07-31");
    expect(valid.comparisonPeriod.from).toBe("2026-07-17");
    expect(countDays(valid.comparisonPeriod.from, valid.comparisonPeriod.to)).toBe(15);

    // Invalid from > to
    const invalidOrder = resolveReportPeriod({
      period: "custom",
      from: "2026-08-15",
      to: "2026-08-01",
      now: refDate,
    });
    expect(invalidOrder.error).toBeDefined();

    // Range exceeding 24 months
    const tooLong = resolveReportPeriod({
      period: "custom",
      from: "2023-01-01",
      to: "2026-01-01",
      now: refDate,
    });
    expect(tooLong.error).toContain("24 months");
  });

  it("navigates forward and backward with getAdjacentPeriod", () => {
    const initial = resolveReportPeriod({
      period: "this_week",
      timezone: "Asia/Ho_Chi_Minh",
      now: refDate,
    }).period;

    const prev = getAdjacentPeriod(initial, "prev");
    expect(prev.period.from).toBe("2026-09-21");
    expect(prev.period.to).toBe("2026-09-27");

    const next = getAdjacentPeriod(initial, "next");
    expect(next.period.from).toBe("2026-10-05");
    expect(next.period.to).toBe("2026-10-11");
  });

  it("formats display label properly", () => {
    const week = resolveReportPeriod({ period: "this_week", now: refDate }).period;
    expect(getPeriodDisplayLabel(week)).toContain("Tuần này");
  });
});
