import { describe, expect, it } from "vitest";
import { businessDaysBetween, overdueBusinessDays } from "./business-days";

// 2026 calendar: Jan 1 = Thursday
// Week 1: Thu 1, Fri 2, Sat 3, Sun 4, Mon 5, Tue 6, Wed 7, Thu 8, Fri 9
// Week 2: Sat 10, Sun 11, Mon 12, Tue 13, Wed 14, Thu 15, Fri 16
// Week 3: Sat 17, Sun 18, Mon 19, Tue 20, Wed 21

describe("businessDaysBetween", () => {
  it("counts zero when from is null", () => {
    expect(businessDaysBetween(null, new Date("2026-01-05"))).toBe(0);
  });

  it("counts 2 for same business day (inclusive of start and end)", () => {
    // Mon Jan 5 09:00 → Mon Jan 5 17:00 = 2 (counts start day + end day inclusively)
    expect(businessDaysBetween(new Date("2026-01-05T09:00:00Z"), new Date("2026-01-05T17:00:00Z"))).toBe(2);
  });

  it("counts Fri to Mon as 2 business days (Fri + Mon, inclusive)", () => {
    // Fri Jan 9 → Mon Jan 12 = 2 (Fri, Mon)
    expect(businessDaysBetween(new Date("2026-01-09T10:00:00Z"), new Date("2026-01-12T10:00:00Z"))).toBe(2);
  });

  it("counts one week Mon to Mon as 6 business days", () => {
    // Mon Jan 5 → Mon Jan 12 (inclusive) = 6 (Mon,Tue,Wed,Thu,Fri,Mon)
    expect(businessDaysBetween(new Date("2026-01-05T09:00:00Z"), new Date("2026-01-12T09:00:00Z"))).toBe(6);
  });

  it("counts two weeks Mon to Mon as 11 business days", () => {
    // Mon Jan 5 → Mon Jan 19 (inclusive) = 11
    expect(businessDaysBetween(new Date("2026-01-05T09:00:00Z"), new Date("2026-01-19T09:00:00Z"))).toBe(11);
  });

  it("returns 0 when end is before start", () => {
    expect(businessDaysBetween(new Date("2026-01-19T09:00:00Z"), new Date("2026-01-05T09:00:00Z"))).toBe(0);
  });

  it("excludes weekends", () => {
    // Fri Jan 9 → Sat Jan 10 = 1 business day (only Fri)
    expect(businessDaysBetween(new Date("2026-01-09T09:00:00Z"), new Date("2026-01-10T09:00:00Z"))).toBe(1);
  });

  it("returns 0 when start and end are both weekend days", () => {
    // Sat Jan 10 → Sun Jan 11 = 0 (no business days)
    expect(businessDaysBetween(new Date("2026-01-10T09:00:00Z"), new Date("2026-01-11T09:00:00Z"))).toBe(0);
  });
});

describe("overdueBusinessDays", () => {
  it("returns 0 when dueDate is null", () => {
    expect(overdueBusinessDays(null, new Date("2026-01-19"))).toBe(0);
  });

  it("returns 0 when due date is in the future", () => {
    expect(overdueBusinessDays(new Date("2026-02-01"), new Date("2026-01-15"))).toBe(0);
  });

  it("returns 0 when due date is today", () => {
    expect(overdueBusinessDays(new Date("2026-01-15"), new Date("2026-01-15"))).toBe(0);
  });

  it("returns 2 for due Thu, now Fri (both weekdays, inclusive)", () => {
    // Due Thu Jan 15, now Fri Jan 16 = 2 (Thu + Fri, inclusive)
    expect(overdueBusinessDays(new Date("2026-01-15"), new Date("2026-01-16"))).toBe(2);
  });

  it("counts business days past due across weekend", () => {
    // Due Fri Jan 16, now Mon Jan 19 = 2 (Fri + Mon, inclusive)
    expect(overdueBusinessDays(new Date("2026-01-16"), new Date("2026-01-19"))).toBe(2);
  });
});
