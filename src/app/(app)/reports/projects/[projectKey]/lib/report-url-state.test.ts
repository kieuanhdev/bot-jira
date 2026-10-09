import { describe, it, expect } from "vitest";
import {
  buildReportUrlSearchParams,
  buildReportQueryParams,
  buildRiskQueryParams,
  extractExportFilename,
} from "./report-url-state";
import type { ReportPeriod } from "@/lib/reports/types";

describe("report-url-state", () => {
  const period: ReportPeriod = {
    preset: "this_month",
    from: "2026-10-01",
    to: "2026-10-31",
    timezone: "Asia/Ho_Chi_Minh",
  };

  it("builds URL search params for overview tab", () => {
    const params = buildReportUrlSearchParams({
      period,
      versionId: "10001",
      unit: "points",
      activeTab: "overview",
      activeActivity: "all",
      activeStatusGroup: null,
      activeAssignee: "all",
    });
    expect(params.get("period")).toBe("this_month");
    expect(params.get("versionId")).toBe("10001");
    expect(params.get("unit")).toBe("points");
    expect(params.has("tab")).toBe(false);
  });

  it("builds URL search params for tasks drill-down", () => {
    const params = buildReportUrlSearchParams({
      period,
      versionId: "all",
      unit: "auto",
      activeTab: "tasks",
      activeActivity: "completed",
      activeStatusGroup: "Done",
      activeAssignee: "usr-42",
    });
    expect(params.get("tab")).toBe("tasks");
    expect(params.get("activity")).toBe("completed");
    expect(params.get("statusGroup")).toBe("Done");
    expect(params.get("assignee")).toBe("usr-42");
  });

  it("builds report query params for API call", () => {
    const q = buildReportQueryParams(period, "10002", "estimate");
    expect(q.period).toBe("this_month");
    expect(q.from).toBe("2026-10-01");
    expect(q.to).toBe("2026-10-31");
    expect(q.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(q.versionId).toBe("10002");
    expect(q.unit).toBe("estimate");
  });

  it("builds risk query params with limits, offsets, and filters", () => {
    const q = buildRiskQueryParams("10003", 40, "overdue");
    expect(q.limit).toBe("20");
    expect(q.offset).toBe("40");
    expect(q.versionId).toBe("10003");
    expect(q.risk).toBe("overdue");
  });

  it("extracts export filename from Content-Disposition header with fallback", () => {
    expect(
      extractExportFilename(
        'attachment; filename="report-2026-10.csv"',
        "fallback.csv"
      )
    ).toBe("report-2026-10.csv");
    expect(
      extractExportFilename(
        "attachment; filename=report.csv",
        "fallback.csv"
      )
    ).toBe("report.csv");
    expect(extractExportFilename(null, "fallback.csv")).toBe("fallback.csv");
  });
});
