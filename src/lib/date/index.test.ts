import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  APP_TIMEZONE,
  isDateKey,
  toDateKey,
  dateKeyToUtcMidnight,
  utcMidnightToDateKey,
  addDaysToKey,
  diffDays,
  zonedMidnight,
  startOfDayInTz,
  zonedParts,
  startOfIsoWeekKey,
  businessDaysInclusive,
} from "./index";

describe.each(["UTC", "Asia/Ho_Chi_Minh", "America/New_York"])("date helpers under TZ=%s", (tzEnv) => {
  let prevTz: string | undefined;

  beforeEach(() => {
    prevTz = process.env.TZ;
    process.env.TZ = tzEnv;
  });

  afterEach(() => {
    if (prevTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = prevTz;
    }
  });

  describe("APP_TIMEZONE", () => {
    it("is Asia/Ho_Chi_Minh", () => {
      expect(APP_TIMEZONE).toBe("Asia/Ho_Chi_Minh");
    });
  });

  describe("toDateKey", () => {
    it("returns calendar day of instant in default tz (Asia/Ho_Chi_Minh)", () => {
      expect(toDateKey(new Date("2026-10-01T16:59:59Z"))).toBe("2026-10-01");
      expect(toDateKey(new Date("2026-10-01T17:00:00Z"))).toBe("2026-10-02");
    });

    it("respects explicit tz parameter", () => {
      expect(toDateKey(new Date("2026-10-01T17:30:00Z"), "UTC")).toBe("2026-10-01");
    });

    it("throws RangeError on invalid timezone", () => {
      expect(() => toDateKey(new Date(), "Bad/Zone")).toThrow(RangeError);
    });
  });

  describe("isDateKey", () => {
    it("validates real calendar dates strictly", () => {
      expect(isDateKey("2026-02-30")).toBe(false);
      expect(isDateKey("2028-02-29")).toBe(true);
      expect(isDateKey("2026-1-05")).toBe(false);
      expect(isDateKey(20261005)).toBe(false);
    });
  });

  describe("dateKeyToUtcMidnight and utcMidnightToDateKey", () => {
    it("converts DateKey to UTC midnight Date and throws on invalid", () => {
      expect(dateKeyToUtcMidnight("2026-10-07").toISOString()).toBe("2026-10-07T00:00:00.000Z");
      expect(() => dateKeyToUtcMidnight("bad")).toThrow();
    });

    it("converts UTC midnight Date to DateKey", () => {
      expect(utcMidnightToDateKey(new Date("2026-10-07T00:00:00.000Z"))).toBe("2026-10-07");
    });
  });

  describe("addDaysToKey and diffDays", () => {
    it("adds days to a key", () => {
      expect(addDaysToKey("2026-10-31", 1)).toBe("2026-11-01");
    });

    it("computes difference in calendar days (to - from)", () => {
      expect(diffDays("2026-10-01", "2026-10-31")).toBe(30);
      expect(diffDays("2026-10-31", "2026-10-01")).toBe(-30);
    });
  });

  describe("zonedMidnight", () => {
    it("returns instant corresponding to 00:00 in specified/default tz", () => {
      expect(zonedMidnight(2026, 10, 1).toISOString()).toBe("2026-09-30T17:00:00.000Z");
    });

    it("throws RangeError on invalid timezone", () => {
      expect(() => zonedMidnight(2026, 10, 1, "Bad/Zone")).toThrow(RangeError);
    });
  });

  describe("startOfDayInTz", () => {
    it("returns instant corresponding to local 00:00 for the instant's day in tz", () => {
      expect(startOfDayInTz(new Date("2026-10-02T03:00:00Z")).toISOString()).toBe("2026-10-01T17:00:00.000Z");
    });

    it("throws RangeError on invalid timezone", () => {
      expect(() => startOfDayInTz(new Date(), "Bad/Zone")).toThrow(RangeError);
    });
  });

  describe("zonedParts", () => {
    it("extracts year, 1-based month, day, and 0-based weekday in tz", () => {
      expect(zonedParts(new Date("2026-10-04T18:00:00Z"))).toEqual({
        year: 2026,
        month: 10,
        day: 5,
        weekday: 1,
      });
      expect(zonedParts(new Date("2026-10-04T16:00:00Z"))).toEqual({
        year: 2026,
        month: 10,
        day: 4,
        weekday: 0,
      });
    });

    it("throws RangeError on invalid timezone", () => {
      expect(() => zonedParts(new Date(), "Bad/Zone")).toThrow(RangeError);
    });
  });

  describe("startOfIsoWeekKey", () => {
    it("returns Monday DateKey for instant in tz", () => {
      expect(startOfIsoWeekKey(new Date("2026-10-04T18:00:00Z"))).toBe("2026-10-05");
      expect(startOfIsoWeekKey(new Date("2026-10-04T16:00:00Z"))).toBe("2026-09-28");
    });

    it("throws RangeError on invalid timezone", () => {
      expect(() => startOfIsoWeekKey(new Date(), "Bad/Zone")).toThrow(RangeError);
    });
  });

  describe("businessDaysInclusive", () => {
    it("counts Mon-Fri business days inclusively", () => {
      expect(businessDaysInclusive("2026-10-02", "2026-10-05")).toBe(2);
      expect(businessDaysInclusive("2026-10-05", "2026-10-12")).toBe(6);
      expect(businessDaysInclusive("2026-10-03", "2026-10-04")).toBe(0);
      expect(businessDaysInclusive("2026-10-05", "2026-10-02")).toBe(0);
    });
  });
});
