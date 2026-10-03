import { describe, it, expect } from "vitest";
import {
  addBusinessDays,
  isBusinessDay,
  ensureBusinessDay,
  evaluateDueDateWithDeadline,
  isValidDateString,
} from "./business-days";

describe("Business Days & Due Date Calculator", () => {
  describe("isValidDateString", () => {
    it("validates correct ISO YYYY-MM-DD dates", () => {
      expect(isValidDateString("2026-10-05")).toBe(true);
      expect(isValidDateString("2026-02-28")).toBe(true);
      expect(isValidDateString("invalid")).toBe(false);
      expect(isValidDateString("2026-02-30")).toBe(false);
      expect(isValidDateString(null)).toBe(false);
      expect(isValidDateString("")).toBe(false);
    });
  });

  describe("isBusinessDay", () => {
    it("correctly identifies weekdays vs weekends", () => {
      // 2026-10-02 is Friday, 2026-10-03 is Saturday, 2026-10-04 is Sunday, 2026-10-05 is Monday
      expect(isBusinessDay("2026-10-02")).toBe(true);
      expect(isBusinessDay("2026-10-03")).toBe(false); // Saturday
      expect(isBusinessDay("2026-10-04")).toBe(false); // Sunday
      expect(isBusinessDay("2026-10-05")).toBe(true);
    });

    it("respects project holiday calendar", () => {
      const calendar = { holidays: ["2026-10-05"] };
      expect(isBusinessDay("2026-10-05", calendar)).toBe(false);
      expect(isBusinessDay("2026-10-06", calendar)).toBe(true);
    });
  });

  describe("ensureBusinessDay", () => {
    it("shifts weekend dates forward to Monday", () => {
      const saturday = ensureBusinessDay("2026-10-03"); // Saturday
      expect(saturday.toISOString().slice(0, 10)).toBe("2026-10-05"); // Monday
    });
  });

  describe("addBusinessDays", () => {
    it("returns same day for 1 business day started on Monday", () => {
      // Monday 2026-10-05 + 1 day baseline -> completes Monday 2026-10-05
      const due = addBusinessDays("2026-10-05", 1);
      expect(due).toBe("2026-10-05");
    });

    it("returns next business day for 2 business days", () => {
      // Monday 2026-10-05 + 2 days -> Tuesday 2026-10-06
      const due = addBusinessDays("2026-10-05", 2);
      expect(due).toBe("2026-10-06");
    });

    it("skips weekend when crossing Friday into next week", () => {
      // Friday 2026-10-02 + 2 business days -> Monday 2026-10-05
      const due = addBusinessDays("2026-10-02", 2);
      expect(due).toBe("2026-10-05");
    });

    it("handles decimal cycle time by rounding up to next business day (MVP ceil rule)", () => {
      // 1.5 days rounds up to 2 business days
      // Friday 2026-10-02 + 1.5 days -> Monday 2026-10-05
      const due = addBusinessDays("2026-10-02", 1.5);
      expect(due).toBe("2026-10-05");

      // 2.5 days rounds up to 3 business days
      // Friday 2026-10-02 + 3 business days -> Tuesday 2026-10-06
      const due3 = addBusinessDays("2026-10-02", 2.5);
      expect(due3).toBe("2026-10-06");
    });

    it("skips holidays in project calendar", () => {
      // Monday 2026-10-05 is holiday, Friday 2026-10-02 + 2 days -> Tuesday 2026-10-06
      const calendar = { holidays: ["2026-10-05"] };
      const due = addBusinessDays("2026-10-02", 2, calendar);
      expect(due).toBe("2026-10-06");
    });

    it("auto-shifts start date if start date falls on weekend", () => {
      // Saturday 2026-10-03 shifts to Monday 2026-10-05, + 1 day -> 2026-10-05
      const due = addBusinessDays("2026-10-03", 1);
      expect(due).toBe("2026-10-05");
    });
  });

  describe("evaluateDueDateWithDeadline", () => {
    it("computes baseline due date when plannedStartDate is provided", () => {
      const result = evaluateDueDateWithDeadline({
        plannedStartDate: "2026-10-05",
        cycleTimeUpperDays: 2.5, // ceil -> 3 days: 05, 06, 07
      });

      expect(result.dueDate).toBe("2026-10-07");
      expect(result.calculatedBaselineDate).toBe("2026-10-07");
      expect(result.isOverridden).toBe(false);
      expect(result.errors).toHaveLength(0);
    });

    it("allows business deadline override earlier than baseline when reason is provided", () => {
      const result = evaluateDueDateWithDeadline({
        plannedStartDate: "2026-10-05",
        cycleTimeUpperDays: 4, // 2026-10-08
        businessDeadline: "2026-10-06",
        businessDeadlineReason: "Yêu cầu bàn giao gấp cho khách hàng trước demo",
      });

      expect(result.dueDate).toBe("2026-10-06");
      expect(result.isOverridden).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("errors if business deadline is earlier than baseline but reason is missing", () => {
      const result = evaluateDueDateWithDeadline({
        plannedStartDate: "2026-10-05",
        cycleTimeUpperDays: 4, // 2026-10-08
        businessDeadline: "2026-10-06",
        businessDeadlineReason: "", // missing reason!
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("thiếu lý do bắt buộc");
    });

    it("handles missing plannedStartDate with warning and no calculated baseline", () => {
      const result = evaluateDueDateWithDeadline({});
      expect(result.dueDate).toBeNull();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.calculatedBaselineDate).toBeNull();
    });
  });
});
