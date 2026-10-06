import { describe, expect, it } from "vitest";
import {
  transitionTo,
  getDefaultLogStartedAt,
  validateWorklog,
  PRIORITIES,
} from "./issue-detail-utils";

describe("issue-detail-utils", () => {
  describe("PRIORITIES", () => {
    it("contains expected Jira priority options", () => {
      expect(PRIORITIES).toContain("Blocker");
      expect(PRIORITIES).toContain("Highest");
      expect(PRIORITIES).toContain("High");
      expect(PRIORITIES).toContain("Medium");
      expect(PRIORITIES).toContain("Low");
      expect(PRIORITIES).toContain("Lowest");
    });
  });

  describe("transitionTo", () => {
    it("extracts destination name when to is string", () => {
      expect(transitionTo({ id: "1", name: "Done", to: "Done" })).toBe("Done");
    });

    it("extracts destination name when to is object", () => {
      expect(transitionTo({ id: "1", name: "T", to: { name: "In Progress" } })).toBe("In Progress");
    });

    it("falls back to transition name if to is missing name", () => {
      expect(transitionTo({ id: "1", name: "Default Transition", to: {} })).toBe("Default Transition");
    });
  });

  describe("getDefaultLogStartedAt", () => {
    it("formats date to YYYY-MM-DDTHH:mm string", () => {
      const fixed = new Date("2026-10-06T15:30:00Z");
      const formatted = getDefaultLogStartedAt(fixed);
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });
  });

  describe("validateWorklog", () => {
    const now = new Date("2026-10-06T12:00:00Z").getTime();

    it("rejects invalid Jira duration string", () => {
      const res = validateWorklog("invalid", "2026-10-06T11:00", now);
      expect(res.error).toContain("Thời lượng không hợp lệ");
      expect(res.parsedSeconds).toBeUndefined();
    });

    it("rejects missing startedAt", () => {
      const res = validateWorklog("2h", "", now);
      expect(res.error).toBe("Thời điểm bắt đầu là bắt buộc.");
    });

    it("rejects invalid startedAt string", () => {
      const res = validateWorklog("2h", "not-a-date", now);
      expect(res.error).toBe("Thời điểm bắt đầu không hợp lệ.");
    });

    it("rejects future startedAt over 5 minutes ahead", () => {
      const future = new Date(now + 10 * 60 * 1000).toISOString();
      const res = validateWorklog("1h", future, now);
      expect(res.error).toContain("quá 5 phút");
    });

    it("accepts valid worklog duration and date within allowed window", () => {
      const past = new Date(now - 30 * 60 * 1000).toISOString();
      const res = validateWorklog("1h 30m", past, now);
      expect(res.error).toBeUndefined();
      expect(res.parsedSeconds).toBe(5400);
      expect(res.startedDate).toBeInstanceOf(Date);
    });
  });
});
