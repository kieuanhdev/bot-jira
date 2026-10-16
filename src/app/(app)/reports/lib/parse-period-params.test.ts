import { describe, it, expect } from "vitest";
import { parsePeriodParams } from "./parse-period-params";
import { DEFAULT_REPORT_TIMEZONE } from "@/lib/reports/period";

describe("parsePeriodParams", () => {
  const fixedNow = new Date("2026-10-15T10:00:00.000Z");

  it("defaults to this_week and DEFAULT_REPORT_TIMEZONE when source is empty", () => {
    const period = parsePeriodParams(undefined, fixedNow);
    expect(period.preset).toBe("this_week");
    expect(period.timezone).toBe(DEFAULT_REPORT_TIMEZONE);
    expect(period.from).toBe("2026-10-12");
    expect(period.to).toBe("2026-10-18");
  });

  it("parses period preset from URLSearchParams", () => {
    const params = new URLSearchParams("period=last_week");
    const period = parsePeriodParams(params, fixedNow);
    expect(period.preset).toBe("last_week");
    expect(period.timezone).toBe(DEFAULT_REPORT_TIMEZONE);
    expect(period.from).toBe("2026-10-05");
    expect(period.to).toBe("2026-10-11");
  });

  it("parses custom date range from Record", () => {
    const params = {
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-10",
      timezone: "America/New_York",
    };
    const period = parsePeriodParams(params, fixedNow);
    expect(period.preset).toBe("custom");
    expect(period.from).toBe("2026-10-01");
    expect(period.to).toBe("2026-10-10");
    expect(period.timezone).toBe("America/New_York");
  });

  it("handles string array values from Server Component searchParams", () => {
    const params = {
      period: ["this_month"],
    };
    const period = parsePeriodParams(params, fixedNow);
    expect(period.preset).toBe("this_month");
    expect(period.timezone).toBe(DEFAULT_REPORT_TIMEZONE);
    expect(period.from).toBe("2026-10-01");
    expect(period.to).toBe("2026-10-31");
  });
});
