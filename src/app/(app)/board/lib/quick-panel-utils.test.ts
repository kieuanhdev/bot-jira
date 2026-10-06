import { describe, expect, it } from "vitest";
import { toName, statusCatOf, PRIORITIES } from "./quick-panel-utils";

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
