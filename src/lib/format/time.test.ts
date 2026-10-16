import { describe, it, expect } from "vitest";
import {
  timeAgo,
  formatRelative,
  formatRelativeTimeVi,
  formatAge,
  formatDuration,
  formatJiraDuration,
  formatSecondsToJira,
  formatTimeSpent,
  formatDurationMs,
  formatDateTime,
  formatDate,
} from "./time";

describe("timeAgo characterization", () => {
  it("returns dash for null/undefined/invalid", () => {
    expect(timeAgo(null)).toBe("—");
    expect(timeAgo(undefined)).toBe("—");
    expect(timeAgo("not-a-date")).toBe("—");
    expect(timeAgo("")).toBe("—");
    expect(timeAgo(new Date("invalid"))).toBe("—");
  });

  it("formats relative ranges in English", () => {
    const base = new Date("2026-10-16T12:00:00Z").getTime();
    expect(formatRelative(new Date(base), { locale: "en", now: base })).toBe("just now");
    expect(formatRelative(new Date(base - 30_000), { locale: "en", now: base })).toBe("just now");
    expect(formatRelative(new Date(base - 5 * 60_000), { locale: "en", now: base })).toBe("5m ago");
    expect(formatRelative(new Date(base - 3 * 3_600_000), { locale: "en", now: base })).toBe("3h ago");
    expect(formatRelative(new Date(base - 5 * 86_400_000), { locale: "en", now: base })).toBe("5d ago");
    expect(formatRelative(new Date(base - 60 * 86_400_000), { locale: "en", now: base })).toBe("2mo ago");
    expect(formatRelative(new Date(base - 400 * 86_400_000), { locale: "en", now: base })).toBe("1y ago");
  });
});

describe("formatRelativeTimeVi characterization", () => {
  it("handles null/invalid", () => {
    expect(formatRelativeTimeVi("invalid")).toBe("—");
  });

  it("formats Vietnamese relative intervals matching notification metadata", () => {
    const base = new Date("2026-10-16T12:00:00Z").getTime();
    expect(formatRelative(new Date(base - 30_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("Vừa xong");
    expect(formatRelative(new Date(base - 5 * 60_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("5 phút trước");
    expect(formatRelative(new Date(base - 3 * 3_600_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("3 giờ trước");
    expect(formatRelative(new Date(base - 1 * 86_400_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("Hôm qua");
    expect(formatRelative(new Date(base - 4 * 86_400_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("4 ngày trước");
    expect(formatRelative(new Date(base - 15 * 86_400_000), { locale: "vi", now: base, thresholds: { showYesterday: true, showWeeks: true } })).toBe("2 tuần trước");
  });

  it("supports report table style with empty text 'Chưa đồng bộ'", () => {
    const base = new Date("2026-10-16T12:00:00Z").getTime();
    expect(formatRelative(null, { locale: "vi", empty: "Chưa đồng bộ" })).toBe("Chưa đồng bộ");
    expect(formatRelative(new Date(base - 10_000), { locale: "vi", now: base, empty: "Chưa đồng bộ" })).toBe("Vừa xong");
    expect(formatRelative(new Date(base - 10 * 60_000), { locale: "vi", now: base, empty: "Chưa đồng bộ" })).toBe("10 phút trước");
    expect(formatRelative(new Date(base - 5 * 3_600_000), { locale: "vi", now: base, empty: "Chưa đồng bộ" })).toBe("5 giờ trước");
  });
});

describe("formatAge characterization (admin overview)", () => {
  it("formats age in minutes and hours", () => {
    expect(formatAge(null)).toBe("chưa có");
    expect(formatAge(20_000)).toBe("< 1 phút");
    expect(formatAge(30_000)).toBe("1 phút");
    expect(formatAge(5 * 60_000)).toBe("5 phút");
    expect(formatAge(120 * 60_000)).toBe("2 giờ");
  });
});

describe("formatDuration and Jira duration helpers", () => {
  it("formats duration with custom options", () => {
    expect(formatDuration(null, { empty: "—" })).toBe("—");
    expect(formatDuration(0, { empty: null })).toBeNull();
    expect(formatDuration(5400, { units: "hm" })).toBe("1h 30m");
    expect(formatDuration(28800, { units: "jira" })).toBe("1d");
  });

  it("formats Jira durations accurately matching formatJiraDuration", () => {
    expect(formatJiraDuration(1800)).toBe("30m");
    expect(formatJiraDuration(7200)).toBe("2h");
    expect(formatJiraDuration(9000)).toBe("2h 30m");
    expect(formatJiraDuration(28800)).toBe("1d");
    expect(formatJiraDuration(43200)).toBe("1d 4h");
    expect(formatJiraDuration(144000)).toBe("1w");
    expect(formatJiraDuration(144000 + 28800 + 7200 + 300)).toBe("1w 1d 2h 5m");
    expect(formatJiraDuration(0)).toBe("0m");
    expect(formatJiraDuration(-100)).toBe("0m");
    expect(formatJiraDuration(null)).toBe("0m");
    expect(formatJiraDuration(undefined)).toBe("0m");
  });

  it("formats seconds to Jira matching formatSecondsToJira", () => {
    expect(formatSecondsToJira(null)).toBe("—");
    expect(formatSecondsToJira(0)).toBe("—");
    expect(formatSecondsToJira(-50)).toBe("—");
    expect(formatSecondsToJira("invalid")).toBe("—");
    expect(formatSecondsToJira(45)).toBe("45s");
    expect(formatSecondsToJira(3600)).toBe("1h");
    expect(formatSecondsToJira(28800)).toBe("1d");
    expect(formatSecondsToJira(32400)).toBe("1d 1h");
    expect(formatSecondsToJira(32460)).toBe("1d 1h 1m");
  });

  it("formats time spent matching formatTimeSpent", () => {
    expect(formatTimeSpent(null)).toBeNull();
    expect(formatTimeSpent(0)).toBeNull();
    expect(formatTimeSpent(45)).toBe("45s");
    expect(formatTimeSpent(3600)).toBe("1h");
    expect(formatTimeSpent(5400)).toBe("1h 30m");
    expect(formatTimeSpent(7200)).toBe("2h");
  });

  it("formats millisecond durations matching formatStats formatDuration", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(undefined)).toBe("—");
    expect(formatDurationMs(500)).toBe("500 ms");
    expect(formatDurationMs(5500)).toBe("5.5 s");
    expect(formatDurationMs(125000)).toBe("2m 5s");
  });
});

describe("formatDateTime and formatDate", () => {
  it("formats null and invalid values cleanly", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("invalid")).toBe("—");
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats valid date string", () => {
    const d = "2026-10-16T10:30:00Z";
    expect(formatDateTime(d)).toBeTruthy();
    expect(formatDate(d)).toBeTruthy();
  });
});
