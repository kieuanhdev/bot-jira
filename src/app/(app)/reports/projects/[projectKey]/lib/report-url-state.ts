import type { ReportPeriod, ReportUnit, ReportStatusGroup } from "@/lib/reports/types";

export interface ReportStateParams {
  period: ReportPeriod;
  versionId: string;
  unit: ReportUnit;
  activeTab: string;
  activeActivity: string;
  activeStatusGroup: ReportStatusGroup | null;
  activeAssignee: string;
}

export function buildReportUrlSearchParams(state: ReportStateParams): URLSearchParams {
  const params = new URLSearchParams();
  if (state.period.preset !== "this_week") params.set("period", state.period.preset);
  if (state.period.preset === "custom") {
    params.set("from", state.period.from);
    params.set("to", state.period.to);
  }
  if (state.versionId !== "all") params.set("versionId", state.versionId);
  if (state.unit !== "auto") params.set("unit", state.unit);
  if (state.activeTab !== "overview") params.set("tab", state.activeTab);
  if (state.activeTab === "tasks") {
    if (state.activeActivity !== "all") params.set("activity", state.activeActivity);
    if (state.activeStatusGroup) params.set("statusGroup", state.activeStatusGroup);
    if (state.activeAssignee !== "all") params.set("assignee", state.activeAssignee);
  }
  return params;
}

export function buildReportQueryParams(
  period: ReportPeriod,
  versionId: string,
  unit: ReportUnit
): Record<string, string> {
  const params: Record<string, string> = {
    period: period.preset,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
  };
  if (versionId && versionId !== "all") {
    params.versionId = versionId;
  }
  if (unit !== "auto") params.unit = unit;
  return params;
}

export function buildRiskQueryParams(
  versionId: string,
  riskOffset: number,
  activeKpiFilter: string | null
): Record<string, string> {
  const params: Record<string, string> = {
    limit: "20",
    offset: String(riskOffset),
  };
  if (versionId && versionId !== "all") {
    params.versionId = versionId;
  }
  if (activeKpiFilter && activeKpiFilter !== "done" && activeKpiFilter !== "wip") {
    params.risk = activeKpiFilter;
  }
  return params;
}

export function extractExportFilename(
  disposition: string | null,
  fallback: string
): string {
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) return match[1];
  }
  return fallback;
}
