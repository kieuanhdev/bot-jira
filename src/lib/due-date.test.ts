import { describe, expect, it } from "vitest";
import { isOverdue, startOfTodayForDueDates } from "./due-date";

describe("due date helpers", () => {
  const now = new Date("2026-10-07T08:30:00Z");

  it("treats a task due today as not overdue", () => {
    expect(isOverdue("2026-10-07T00:00:00.000Z", false, now)).toBe(false);
  });

  it("treats a task due yesterday as overdue", () => {
    expect(isOverdue("2026-10-06T00:00:00.000Z", false, now)).toBe(true);
  });

  it("never marks done or undated tasks overdue", () => {
    expect(isOverdue("2026-10-01T00:00:00.000Z", true, now)).toBe(false);
    expect(isOverdue(null, false, now)).toBe(false);
  });

  it("starts the day at 00:00 UTC of the local calendar date", () => {
    expect(startOfTodayForDueDates(now).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("starts the day at 00:00 UTC of next day when now is past midnight in Vietnam time", () => {
    expect(startOfTodayForDueDates(new Date("2026-10-07T18:00:00Z")).toISOString()).toBe(
      "2026-10-08T00:00:00.000Z"
    );
  });
});
