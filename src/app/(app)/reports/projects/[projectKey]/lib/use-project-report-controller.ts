"use client";

import { useState, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import type {
  ProjectDetailResponse,
  RiskTasksResponse,
} from "@/lib/reports/types";
import {
  buildReportQueryParams,
  buildRiskQueryParams,
  extractExportFilename,
} from "./report-url-state";
import { useReportUrlState } from "./use-report-url-state";

export function useProjectReportController(projectKey: string) {
  const urlState = useReportUrlState();
  const {
    period,
    setPeriod,
    versionId,
    setVersionId,
    unit,
    setUnit,
    activeTab,
    activeMember,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    activeSearch,
    activeOffset,
    tasksSearchInput,
    setTasksSearchInput,
    handleTabChange,
    handleSelectMember,
    handleBackFromMember,
    handleDrillDownToTasks,
    handleNavigateToOverview,
    handleNavigateBack,
    setTasksActivity,
    setTasksStatusGroup,
    setTasksAssignee,
    setTasksSearch,
    setTasksOffset,
    resetTasksFilters,
  } = urlState;

  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);
  const [riskOffset, setRiskOffset] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const queryParams = useMemo(() => {
    return buildReportQueryParams(period, versionId, unit);
  }, [period, versionId, unit]);

  const {
    data: report,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ProjectDetailResponse>({
    queryKey: reportsKeys.project(projectKey, queryParams),
    queryFn: () => {
      const sp = new URLSearchParams(queryParams);
      const qs = sp.toString();
      return api<ProjectDetailResponse>(
        `/api/reports/projects/${projectKey}${qs ? `?${qs}` : ""}`
      );
    },
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.projectDetail.staleTime,
    gcTime: queryPolicy.reports.projectDetail.gcTime,
  });

  const riskQueryParams = useMemo(() => {
    return buildRiskQueryParams(versionId, riskOffset, activeKpiFilter);
  }, [versionId, riskOffset, activeKpiFilter]);

  // Section 7.3: Avoid redundant risk fetch when overview already has topRisks
  const shouldFetchRisks = Boolean(activeKpiFilter || riskOffset > 0) && activeTab === "overview";

  const { data: riskData } = useQuery<RiskTasksResponse>({
    queryKey: reportsKeys.risks(projectKey, riskQueryParams),
    queryFn: () => {
      const sp = new URLSearchParams(riskQueryParams);
      const qs = sp.toString();
      return api<RiskTasksResponse>(
        `/api/reports/projects/${projectKey}/risks${qs ? `?${qs}` : ""}`
      );
    },
    enabled: shouldFetchRisks,
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.risks.staleTime,
    gcTime: queryPolicy.reports.risks.gcTime,
  });

  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const sp = new URLSearchParams(queryParams);
      const qs = sp.toString();
      const exportUrl = `/api/reports/projects/${projectKey}/export${qs ? `?${qs}` : ""}`;

      const res = await fetch(exportUrl);
      if (!res.ok) throw new Error("Xuất dữ liệu thất bại");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      const disposition = res.headers.get("Content-Disposition");
      const defaultFilename = `project-report-${projectKey.toLowerCase()}-${period.from}-to-${period.to}.csv`;
      a.download = extractExportFilename(disposition, defaultFilename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi khi tải file báo cáo");
    } finally {
      setIsExporting(false);
    }
  };

  return {
    period,
    setPeriod,
    versionId,
    setVersionId,
    unit,
    setUnit,
    activeTab,
    activeMember,
    activeKpiFilter,
    setActiveKpiFilter,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    activeSearch,
    activeOffset,
    tasksSearchInput,
    setTasksSearchInput,
    riskOffset,
    setRiskOffset,
    isExporting,
    report,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    riskData,
    queryParams,
    handleDrillDownToTasks,
    handleNavigateToOverview,
    handleNavigateBack,
    handleSelectMember,
    handleBackFromMember,
    handleTabChange,
    handleExportCsv,
    setTasksActivity,
    setTasksStatusGroup,
    setTasksAssignee,
    setTasksSearch,
    setTasksOffset,
    resetTasksFilters,
  };
}
