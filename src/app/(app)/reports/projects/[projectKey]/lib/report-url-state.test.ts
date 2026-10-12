import { describe, it, expect } from "vitest";
import {
  buildReportUrlSearchParams,
  buildReportQueryParams,
  buildRiskQueryParams,
  extractExportFilename,
  shouldReplaceReportUrl,
} from "./report-url-state";
import type { ReportPeriod } from "@/lib/reports/types";

describe("report-url-state", () => {
  const period: ReportPeriod = {
    preset: "this_month",
    from: "2026-10-01",
    to: "2026-10-31",
    timezone: "Asia/Ho_Chi_Minh",
  };

  it("does not replace a URL that is already pending via push navigation", () => {
    const memberListUrl = "/reports/projects/CICM?tab=members";
    const memberDetailUrl = "/reports/projects/CICM?tab=members&member=ngocdv";

    expect(
      shouldReplaceReportUrl(memberDetailUrl, memberListUrl, memberDetailUrl)
    ).toBe(false);
    expect(
      shouldReplaceReportUrl(memberDetailUrl, memberListUrl, null)
    ).toBe(true);
  });

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
    expect(params.has("period")).toBe(false);
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

  it("builds URL search params for members tab with selected member", () => {
    const params = buildReportUrlSearchParams({
      period,
      versionId: "all",
      unit: "auto",
      activeTab: "members",
      activeMember: "alice",
      activeActivity: "all",
      activeStatusGroup: null,
      activeAssignee: "all",
    });
    expect(params.get("tab")).toBe("members");
    expect(params.get("member")).toBe("alice");
  });

  it("omits member param when activeTab is not members", () => {
    const params = buildReportUrlSearchParams({
      period,
      versionId: "all",
      unit: "auto",
      activeTab: "overview",
      activeMember: "alice",
      activeActivity: "all",
      activeStatusGroup: null,
      activeAssignee: "all",
    });
    expect(params.has("member")).toBe(false);
  });

  it("omits date filters from API calls scoped to a version", () => {
    const q = buildReportQueryParams(period, "10002", "estimate");
    expect(q.period).toBeUndefined();
    expect(q.from).toBeUndefined();
    expect(q.to).toBeUndefined();
    expect(q.timezone).toBe("Asia/Ho_Chi_Minh");
    expect(q.versionId).toBe("10002");
    expect(q.unit).toBe("estimate");
  });

  it("keeps date filters when all versions are selected", () => {
    const q = buildReportQueryParams(period, "all", "auto");
    expect(q.period).toBe("this_month");
    expect(q.from).toBe("2026-10-01");
    expect(q.to).toBe("2026-10-31");
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
