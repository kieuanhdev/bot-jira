import { describe, it, expect } from "vitest";
import type { StatusDistributionItem } from "@/lib/reports/types";
import {
  computeStageStats,
  computeTotals,
  enrichItems,
  formatHours,
  formatPeriodBadge,
  formatPeriodEnd,
  getCurrentTotal,
  getUnitLabel,
} from "./model";

const item = (
  group: StatusDistributionItem["group"],
  count: number,
  points: number,
  estimateSeconds: number
): StatusDistributionItem => ({ group, count, points, estimateSeconds, percentage: 0 });

const distribution = [
  item("Backlog", 2, 3, 7200),
  item("In Progress", 3, 5, 18000),
  item("Blocked", 1, 2, 3600),
  item("Done", 4, 8, 36000),
  item("In Review", 0, 0, 0),
];

describe("status chart model", () => {
  it("sums totals and rounds estimate hours", () => {
    expect(computeTotals(distribution)).toEqual({
      taskCount: 10,
      points: 18,
      estimateSeconds: 64800,
      estimateHours: 18,
    });
  });

  it("picks the total and unit label for each metric", () => {
    const totals = computeTotals(distribution);
    expect(getCurrentTotal("count", totals)).toBe(10);
    expect(getCurrentTotal("points", totals)).toBe(18);
    expect(getCurrentTotal("estimate", totals)).toBe(18);
    expect(getUnitLabel("count")).toBe("task");
    expect(getUnitLabel("points")).toBe("SP");
    expect(getUnitLabel("estimate")).toBe("giờ");
  });

  it("enriches items with metric value and one-decimal percentage", () => {
    const totals = computeTotals(distribution);
    const enriched = enrichItems(distribution, "count", getCurrentTotal("count", totals), false);
    expect(enriched).toHaveLength(5);
    expect(enriched[0]).toMatchObject({ group: "Backlog", metricValue: 2, hours: 2, calculatedPercentage: 20 });
    expect(enriched[1].calculatedPercentage).toBe(30);
  });

  it("drops empty statuses only when asked to", () => {
    const total = 10;
    expect(enrichItems(distribution, "count", total, true).map((i) => i.group)).not.toContain("In Review");
    expect(enrichItems(distribution, "count", total, false).map((i) => i.group)).toContain("In Review");
  });

  it("keeps an item with tasks when its selected metric is zero", () => {
    const only = [item("Backlog", 2, 0, 0)];
    expect(enrichItems(only, "points", 0, true)).toHaveLength(1);
    expect(enrichItems(only, "points", 0, true)[0].calculatedPercentage).toBe(0);
  });

  it("groups statuses into the four delivery stages", () => {
    const total = 10;
    const enriched = enrichItems(distribution, "count", total, false);
    const stages = computeStageStats(enriched, "count", total);
    expect(stages.backlog).toMatchObject({ count: 2, val: 2, pct: 20 });
    expect(stages.wip).toMatchObject({ count: 3, points: 5, val: 3, pct: 30 });
    expect(stages.blocked).toMatchObject({ count: 1, val: 1, pct: 10 });
    expect(stages.done).toMatchObject({ count: 4, val: 4, pct: 40 });
  });

  it("formats hours with a day hint from 24h", () => {
    expect(formatHours(5)).toBe("5h");
    expect(formatHours(24)).toBe("24h (~3d)");
    expect(formatHours(30)).toBe("30h (~3.8d)");
  });

  it("formats the period badge and end date", () => {
    expect(formatPeriodBadge("Tuần này", null)).toBe("Tuần này");
    const period = { from: "2026-10-01", to: "2026-10-07" } as Parameters<typeof formatPeriodBadge>[1];
    expect(formatPeriodBadge(null, period)).toBe("01/10/2026 – 07/10/2026");
    expect(formatPeriodBadge(undefined, null)).toBeNull();
    expect(formatPeriodEnd(period)).toBe("07/10/2026");
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd({ from: "x", to: "odd" } as Parameters<typeof formatPeriodBadge>[1])).toBe("odd");
  });
});
