"use client";

import Link from "next/link";
import { ReportPeriodFilter } from "../../report-period-filter";
import { OverviewTab } from "./overview-tab";
import { TasksTab } from "./tasks-tab";
import { MembersTab } from "./members-tab";
import dynamic from "next/dynamic";

// Trends tab pulls in recharts; load it only when opened.
const TrendsTab = dynamic(() => import("./trends-tab").then((m) => m.TrendsTab), { ssr: false });
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Download,
  AlertCircle,
  RefreshCw,
  Clock,
  Layers,
  CheckSquare,
  Users,
  TrendingUp,
} from "lucide-react";
import type {
  ReportUnit,
  ReportStatusGroup,
} from "@/lib/reports/types";
import { useProjectReportController } from "./lib/use-project-report-controller";

interface ProjectReportClientProps {
  projectKey: string;
}

export function ProjectReportClient({ projectKey }: ProjectReportClientProps) {
  const {
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
    handleDrillDownToTasks,
    handleNavigateToOverview,
    handleExportCsv,
  } = useProjectReportController(projectKey);

  const tabs = [
    { id: "overview", label: "Tổng quan", icon: Layers },
    { id: "tasks", label: "Công việc", icon: CheckSquare },
    { id: "members", label: "Thành viên", icon: Users },
    { id: "trends", label: "Xu hướng", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Back navigation */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          {activeTab !== "overview" ? (
            <button
              type="button"
              onClick={handleNavigateToOverview}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors shadow-xs"
              title="Quay lại Tổng quan"
              aria-label="Quay lại Tổng quan"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link
              href="/reports/projects"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors shadow-xs"
              title="Quay lại danh mục dự án"
              aria-label="Quay lại danh mục dự án"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
              <Link
                href="/reports/projects"
                className="hover:text-foreground hover:underline transition-colors cursor-pointer"
              >
                Báo cáo dự án
              </Link>
              <span>/</span>
              <button
                type="button"
                onClick={handleNavigateToOverview}
                className={
                  activeTab === "overview"
                    ? "text-foreground font-medium"
                    : "hover:text-foreground hover:underline transition-colors cursor-pointer"
                }
              >
                {report?.project.name || projectKey}
              </button>
              {activeTab !== "overview" && (
                <>
                  <span>/</span>
                  <span className="text-foreground font-medium">
                    {tabs.find((t) => t.id === activeTab)?.label || activeTab}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {report?.project.name || projectKey}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-muted text-muted-foreground">
                {projectKey}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{report?.periodLabel || `${period.from} - ${period.to}`}</span>
              {report?.freshness?.lastSyncedAt && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  Đồng bộ Jira: {new Date(report.freshness.lastSyncedAt).toLocaleTimeString("vi-VN")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <ReportPeriodFilter period={period} onPeriodChange={setPeriod} />

          {/* Fix Version selector */}
          <div className="w-[160px]">
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <SelectValue placeholder="Fix Version" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả version</SelectItem>
                {report?.availableVersions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} {v.released ? "(Đã release)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Unit selector */}
          <div className="w-[125px]">
            <Select value={unit} onValueChange={(v) => setUnit(v as ReportUnit)}>
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <SelectValue placeholder="Đơn vị tính" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Tự động (Auto)</SelectItem>
                <SelectItem value="tasks">Số lượng Task</SelectItem>
                <SelectItem value="points">Story Points</SelectItem>
                <SelectItem value="estimate">Estimate (Giờ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting || isLoading}
            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-md border border-border bg-card text-xs font-medium text-foreground hover:bg-accent cursor-pointer transition-colors disabled:opacity-50"
            title="Xuất file CSV báo cáo"
          >
            <Download className="h-3.5 w-3.5" />
            {isExporting ? "Đang xuất..." : "Tải CSV"}
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-4" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium cursor-pointer transition-colors ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-[430px] w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Skeleton className="h-[280px] w-full rounded-xl" />
            <Skeleton className="h-[280px] w-full rounded-xl" />
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-destructive/20 bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" aria-hidden="true" />
          <h3 className="text-base font-semibold text-destructive">
            Không thể tải dữ liệu báo cáo dự án
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {(error as Error)?.message || "Đã xảy ra lỗi khi kết nối tới máy chủ."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Success Tab Content */}
      {report && (
        <div>
          {activeTab === "overview" && (
            <OverviewTab
              report={report}
              activeKpiFilter={activeKpiFilter}
              onKpiFilterChange={(filter) => {
                setActiveKpiFilter(filter);
                setRiskOffset(0);
              }}
              activeStatusGroup={activeStatusGroup}
              onStatusGroupChange={(group) => {
                setActiveStatusGroup(group);
              }}
              onDrillDownToTasks={handleDrillDownToTasks}
              riskData={riskData}
              riskOffset={riskOffset}
              onRiskOffsetChange={setRiskOffset}
              unit={unit}
            />
          )}

          {activeTab === "tasks" && (
            <TasksTab
              projectKey={projectKey}
              period={period}
              versionId={versionId}
              initialStatusGroup={activeStatusGroup}
              initialActivity={activeActivity}
              initialAssignee={activeAssignee}
              onFilterChange={({ activity, statusGroup, assignee }) => {
                setActiveActivity(activity);
                setActiveStatusGroup(
                  statusGroup === "all" ? null : (statusGroup as ReportStatusGroup)
                );
                setActiveAssignee(assignee);
              }}
              onNavigateToOverview={handleNavigateToOverview}
            />
          )}

          {activeTab === "members" && (
            <MembersTab
              projectKey={projectKey}
              period={period}
              versionId={versionId}
              onDrillDownToTasks={handleDrillDownToTasks}
            />
          )}

          {activeTab === "trends" && (
            <TrendsTab
              projectKey={projectKey}
              period={period}
              versionId={versionId}
            />
          )}
        </div>
      )}
    </div>
  );
}
