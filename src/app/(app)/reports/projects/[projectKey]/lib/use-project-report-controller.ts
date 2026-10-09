"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import type {
  ProjectDetailResponse,
  ReportUnit,
  RiskTasksResponse,
  ReportStatusGroup,
  ReportPeriod,
} from "@/lib/reports/types";
import { resolveReportPeriod } from "@/lib/reports/period";
import {
  buildReportUrlSearchParams,
  buildReportQueryParams,
  buildRiskQueryParams,
  extractExportFilename,
} from "./report-url-state";

export function useProjectReportController(projectKey: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialPeriod = useMemo(() => {
    return resolveReportPeriod({
      period: searchParams.get("period") || "this_week",
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      timezone: searchParams.get("timezone") || "Asia/Ho_Chi_Minh",
    }).period;
  }, [searchParams]);

  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [versionId, setVersionId] = useState<string>(searchParams.get("versionId") || "all");
  const [unit, setUnit] = useState<ReportUnit>(
    (searchParams.get("unit") as ReportUnit) || "auto"
  );
  const [activeTab, setActiveTab] = useState<string>(searchParams.get("tab") || "overview");

  const [activeKpiFilter, setActiveKpiFilter] = useState<string | null>(null);
  const [activeActivity, setActiveActivity] = useState<string>(
    searchParams.get("activity") || "all"
  );
  const [activeStatusGroup, setActiveStatusGroup] = useState<ReportStatusGroup | null>(
    (searchParams.get("statusGroup") as ReportStatusGroup) || null
  );
  const [activeAssignee, setActiveAssignee] = useState<string>(
    searchParams.get("assignee") || "all"
  );
  const [riskOffset, setRiskOffset] = useState<number>(0);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Listen to browser Back / Forward history navigation
  const searchParamsString = searchParams.toString();
  const [prevParamsString, setPrevParamsString] = useState(searchParamsString);
  if (searchParamsString !== prevParamsString) {
    setPrevParamsString(searchParamsString);
    setActiveTab(searchParams.get("tab") || "overview");
    setActiveStatusGroup((searchParams.get("statusGroup") as ReportStatusGroup) || null);
    setActiveActivity(searchParams.get("activity") || "all");
    setActiveAssignee(searchParams.get("assignee") || "all");
    setVersionId(searchParams.get("versionId") || "all");
    setUnit((searchParams.get("unit") as ReportUnit) || "auto");
  }

  // Sync state to URL
  useEffect(() => {
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab,
      activeActivity,
      activeStatusGroup,
      activeAssignee,
    });

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    const currentQs = searchParams.toString();
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;

    if (newUrl !== currentUrl) {
      router.replace(newUrl, { scroll: false });
    }
  }, [
    period,
    versionId,
    unit,
    activeTab,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    pathname,
    router,
    searchParams,
  ]);

  const handleDrillDownToTasks = (filter: {
    activity?: string;
    statusGroup?: string;
    assignee?: string;
  }) => {
    const nextActivity = filter.activity !== undefined ? filter.activity : activeActivity;
    const nextStatusGroup =
      filter.statusGroup !== undefined
        ? (filter.statusGroup as ReportStatusGroup)
        : activeStatusGroup;
    const nextAssignee = filter.assignee !== undefined ? filter.assignee : activeAssignee;

    if (filter.activity !== undefined) setActiveActivity(filter.activity);
    if (filter.statusGroup !== undefined)
      setActiveStatusGroup(filter.statusGroup as ReportStatusGroup);
    if (filter.assignee !== undefined) setActiveAssignee(filter.assignee);
    setActiveTab("tasks");

    // Push new history state so Browser Back returns to overview
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: "tasks",
      activeActivity: nextActivity,
      activeStatusGroup: nextStatusGroup,
      activeAssignee: nextAssignee,
    });

    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleNavigateToOverview = () => {
    setActiveTab("overview");
    setActiveStatusGroup(null);
    setActiveActivity("all");
    setActiveAssignee("all");

    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: "overview",
      activeActivity: "all",
      activeStatusGroup: null,
      activeAssignee: "all",
    });
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

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
    staleTime: 60_000,
  });

  const riskQueryParams = useMemo(() => {
    return buildRiskQueryParams(versionId, riskOffset, activeKpiFilter);
  }, [versionId, riskOffset, activeKpiFilter]);

  const { data: riskData } = useQuery<RiskTasksResponse>({
    queryKey: reportsKeys.risks(projectKey, riskQueryParams),
    queryFn: () => {
      const sp = new URLSearchParams(riskQueryParams);
      const qs = sp.toString();
      return api<RiskTasksResponse>(
        `/api/reports/projects/${projectKey}/risks${qs ? `?${qs}` : ""}`
      );
    },
    staleTime: 60_000,
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
    setActiveTab,
    activeKpiFilter,
    setActiveKpiFilter,
    activeActivity,
    setActiveActivity,
    activeStatusGroup,
    setActiveStatusGroup,
    activeAssignee,
    setActiveAssignee,
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
    handleExportCsv,
  };
}
