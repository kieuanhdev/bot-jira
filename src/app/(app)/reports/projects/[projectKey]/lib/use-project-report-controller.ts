"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
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
  shouldReplaceReportUrl,
} from "./report-url-state";

export function useProjectReportController(projectKey: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pendingNavigationUrlRef = useRef<string | null>(null);

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
  const [activeMember, setActiveMember] = useState<string | null>(
    searchParams.get("member") || null
  );

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
    setActiveMember(searchParams.get("member") || null);
    setActiveStatusGroup((searchParams.get("statusGroup") as ReportStatusGroup) || null);
    setActiveActivity(searchParams.get("activity") || "all");
    setActiveAssignee(searchParams.get("assignee") || "all");
    setVersionId(searchParams.get("versionId") || "all");
    setUnit((searchParams.get("unit") as ReportUnit) || "auto");
    setPeriod(
      resolveReportPeriod({
        period: searchParams.get("period") || "this_week",
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        timezone: searchParams.get("timezone") || "Asia/Ho_Chi_Minh",
      }).period
    );
  }

  // Sync state to URL
  useEffect(() => {
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab,
      activeMember,
      activeActivity,
      activeStatusGroup,
      activeAssignee,
    });

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    const currentQs = searchParams.toString();
    const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;

    if (pendingNavigationUrlRef.current === currentUrl) {
      pendingNavigationUrlRef.current = null;
    }

    if (shouldReplaceReportUrl(newUrl, currentUrl, pendingNavigationUrlRef.current)) {
      router.replace(newUrl, { scroll: false });
    }
  }, [
    period,
    versionId,
    unit,
    activeTab,
    activeMember,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    pathname,
    router,
    searchParams,
  ]);

  const handleTabChange = (tabId: string) => {
    if (tabId === activeTab) return;
    setActiveTab(tabId);
    const nextMember = tabId === "members" ? activeMember : null;
    if (tabId !== "members") {
      setActiveMember(null);
    }
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: tabId,
      activeMember: nextMember,
      activeActivity,
      activeStatusGroup,
      activeAssignee,
    });
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    pendingNavigationUrlRef.current = nextUrl;
    router.push(nextUrl, { scroll: false });
  };

  const handleSelectMember = (assignee: string | null) => {
    setActiveMember(assignee);
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: "members",
      activeMember: assignee,
      activeActivity,
      activeStatusGroup,
      activeAssignee,
    });
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    pendingNavigationUrlRef.current = nextUrl;
    if (assignee) {
      router.push(nextUrl, { scroll: false });
    } else {
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        router.push(nextUrl, { scroll: false });
      }
    }
  };

  const handleBackFromMember = () => {
    handleSelectMember(null);
  };

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
    setActiveMember(null);

    // Push new history state so Browser Back returns to overview / previous screen
    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: "tasks",
      activeMember: null,
      activeActivity: nextActivity,
      activeStatusGroup: nextStatusGroup,
      activeAssignee: nextAssignee,
    });

    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    pendingNavigationUrlRef.current = nextUrl;
    router.push(nextUrl, { scroll: false });
  };

  const handleNavigateToOverview = () => {
    setActiveTab("overview");
    setActiveMember(null);
    setActiveStatusGroup(null);
    setActiveActivity("all");
    setActiveAssignee("all");

    const params = buildReportUrlSearchParams({
      period,
      versionId,
      unit,
      activeTab: "overview",
      activeMember: null,
      activeActivity: "all",
      activeStatusGroup: null,
      activeAssignee: "all",
    });
    const qs = params.toString();
    const nextUrl = qs ? `${pathname}?${qs}` : pathname;
    pendingNavigationUrlRef.current = nextUrl;
    router.push(nextUrl, { scroll: false });
  };

  const handleNavigateBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      handleNavigateToOverview();
    }
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
    setActiveTab,
    activeMember,
    setActiveMember,
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
    handleNavigateBack,
    handleSelectMember,
    handleBackFromMember,
    handleTabChange,
    handleExportCsv,
  };
}
