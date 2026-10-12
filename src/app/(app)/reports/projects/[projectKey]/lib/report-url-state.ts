import type { ReportPeriod, ReportUnit, ReportStatusGroup } from "@/lib/reports/types";

export interface ReportStateParams {
  period: ReportPeriod;
  versionId: string;
  unit: ReportUnit;
  activeTab: string;
  activeMember?: string | null;
  activeActivity: string;
  activeStatusGroup: ReportStatusGroup | null;
  activeAssignee: string;
}

export function shouldReplaceReportUrl(
  nextUrl: string,
  currentUrl: string,
  pendingNavigationUrl: string | null
): boolean {
  return nextUrl !== currentUrl && nextUrl !== pendingNavigationUrl;
}

export function buildReportUrlSearchParams(state: ReportStateParams): URLSearchParams {
  const params = new URLSearchParams();
  const isVersionScope = state.versionId !== "all";
  if (!isVersionScope) {
    if (state.period.preset !== "this_week") params.set("period", state.period.preset);
    if (state.period.preset === "custom") {
      params.set("from", state.period.from);
      params.set("to", state.period.to);
    }
  }
  if (state.versionId !== "all") params.set("versionId", state.versionId);
  if (state.unit !== "auto") params.set("unit", state.unit);
  if (state.activeTab !== "overview") params.set("tab", state.activeTab);
  if (state.activeTab === "members" && state.activeMember) {
    params.set("member", state.activeMember);
  }
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
  const params: Record<string, string> = { timezone: period.timezone };
  if (versionId && versionId !== "all") {
    params.versionId = versionId;
  } else {
    params.period = period.preset;
    params.from = period.from;
    params.to = period.to;
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
