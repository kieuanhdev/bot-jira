import { describe, expect, it } from "vitest";
import { dueDatePresets, statusCatOf, toJiraDate, toName, PRIORITIES } from "./quick-panel-utils";

describe("quick-panel-utils", () => {
  describe("PRIORITIES", () => {
    it("contains expected priority levels", () => {
      expect(PRIORITIES).toContain("Blocker");
      expect(PRIORITIES).toContain("High");
      expect(PRIORITIES).toContain("Medium");
      expect(PRIORITIES).toContain("Low");
    });
  });

  describe("toName", () => {
    it("returns empty string if undefined", () => {
      expect(toName(undefined)).toBe("");
      expect(toName({})).toBe("");
    });

    it("handles string to property", () => {
      expect(toName({ to: "In Progress" })).toBe("In Progress");
    });

    it("handles object to property", () => {
      expect(toName({ to: { name: "Done" } })).toBe("Done");
      expect(toName({ to: {} })).toBe("");
    });
  });

  describe("statusCatOf", () => {
    it("detects done/resolved/closed/complete transition names", () => {
      expect(statusCatOf({ to: "Done" }, { statusCategory: "indeterminate" })).toBe(true);
      expect(statusCatOf({ to: "Resolved" }, { statusCategory: "indeterminate" })).toBe(true);
      expect(statusCatOf({ to: "Closed" }, { statusCategory: "indeterminate" })).toBe(true);
      expect(statusCatOf({ to: "Complete" }, { statusCategory: "indeterminate" })).toBe(true);
    });

    it("falls back to issue.statusCategory === 'done'", () => {
      expect(statusCatOf({ to: "In Review" }, { statusCategory: "done" })).toBe(true);
      expect(statusCatOf({ to: "In Progress" }, { statusCategory: "in_progress" })).toBe(false);
    });
  });
});

describe("toJiraDate", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toJiraDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });

  it("uses the local day, not UTC", () => {
    // 2026-03-01 00:30 local is still 2026-02-28 in UTC for positive offsets.
    expect(toJiraDate(new Date(2026, 2, 1, 0, 30))).toBe("2026-03-01");
  });
});

describe("dueDatePresets", () => {
  it("offers today, tomorrow, this Friday and next week", () => {
    // Monday 2026-10-12.
    const presets = dueDatePresets(new Date(2026, 9, 12, 9, 0));
    expect(presets.map((p) => p.value)).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-16",
      "2026-10-19",
    ]);
  });

  it("keeps 'this Friday' on the same day when today is Friday", () => {
    const presets = dueDatePresets(new Date(2026, 9, 16, 9, 0));
    expect(presets[2]).toEqual({ label: "Thứ Sáu này", value: "2026-10-16" });
  });

  it("rolls 'this Friday' forward when the week's Friday has passed", () => {
    // Saturday 2026-10-17 → the next Friday, never a past date.
    const presets = dueDatePresets(new Date(2026, 9, 17, 9, 0));
    expect(presets[2].value).toBe("2026-10-23");
  });
});
