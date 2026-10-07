"use client";

import { ProjectHealthSummary } from "./project-health-summary";
import { ProjectKpis } from "./project-kpis";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// recharts is heavy; load the charts on demand.
const chartLoading = () => <Skeleton className="h-64 w-full" />;
const StatusDistributionChart = dynamic(
  () => import("./status-distribution-chart").then((m) => m.StatusDistributionChart),
  { ssr: false, loading: chartLoading },
);
const ThroughputFlowChart = dynamic(
  () => import("./throughput-flow-chart").then((m) => m.ThroughputFlowChart),
  { ssr: false, loading: chartLoading },
);
const BottleneckChart = dynamic(
  () => import("./bottleneck-chart").then((m) => m.BottleneckChart),
  { ssr: false, loading: chartLoading },
);
import { RiskTaskTable } from "./risk-task-table";
import { AlertTriangle } from "lucide-react";
import type {
  ProjectDetailResponse,
  ReportStatusGroup,
  RiskTasksResponse,
  ReportUnit,
} from "@/lib/reports/types";

interface OverviewTabProps {
  report: ProjectDetailResponse;
  activeKpiFilter: string | null;
  onKpiFilterChange: (filter: string | null) => void;
  activeStatusGroup: ReportStatusGroup | null;
  onStatusGroupChange: (group: ReportStatusGroup | null) => void;
  onDrillDownToTasks?: (filter: { activity?: string; statusGroup?: string }) => void;
  riskData?: RiskTasksResponse;
  riskOffset: number;
  onRiskOffsetChange: (offset: number) => void;
  unit?: ReportUnit;
}

export function OverviewTab({
  report,
  activeKpiFilter,
  onKpiFilterChange,
  activeStatusGroup,
  onStatusGroupChange,
  onDrillDownToTasks,
  riskData,
  riskOffset,
  onRiskOffsetChange,
  unit,
}: OverviewTabProps) {
  const isVersionScope = Boolean(report.scope.versionId);

  return (
    <div className="space-y-6">
      {/* Data Quality Warnings */}
      {report.dataQuality && report.dataQuality.length > 0 && (
        <div className="space-y-2">
          {report.dataQuality.map((warn) => (
            <div
              key={warn.code}
              className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs ${
                warn.severity === "high"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200"
              }`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold uppercase tracking-wider block">
                  Lưu ý chất lượng dữ liệu ({warn.code})
                </span>
                <span className="text-muted-foreground mt-0.5 block">{warn.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Health Banner */}
      <ProjectHealthSummary
        status={report.health.status}
        headline={report.health.headline}
        reasons={report.health.reasons}
      />

      {/* KPIs Grid */}
      <ProjectKpis
        progress={
          report.kpis?.progress || {
            percentage: report.snapshotAtEnd.completionRatio,
            done: report.snapshotAtEnd.doneAtEnd,
            total: report.snapshotAtEnd.totalAtEnd,
            unit: report.scope.unit,
          }
        }
        coverage={report.kpis?.coverage || report.snapshotAtEnd.coverage}
        snapshotAtEnd={report.snapshotAtEnd}
        flow={report.flow}
        comparison={report.comparison}
        wipCount={report.snapshotAtEnd.wipAtEnd}
        blockedCount={report.snapshotAtEnd.blockedAtEnd}
        overdueCount={report.snapshotAtEnd.overdueAtEnd}
        overSlaCount={report.snapshotAtEnd.overSlaAtEnd}
        isVersionScope={isVersionScope}
        activeFilter={activeKpiFilter}
        onFilterChange={onKpiFilterChange}
        onViewInTasks={(filterKey) =>
          onDrillDownToTasks?.({
            activity: filterKey === "wip" ? "current_open" : filterKey,
          })
        }
      />

      {/* Status distribution: task counts and matching donut chart */}
      <StatusDistributionChart
        distribution={report.statusDistribution}
        onSelectGroup={(group) => onStatusGroupChange(group)}
        onDrillDownToTasks={(group) => onDrillDownToTasks?.({ statusGroup: group })}
        selectedGroup={activeStatusGroup}
        unit={unit || report.scope.unit}
        periodLabel={report.periodLabel}
        period={report.period}
      />

      {/* Flow and bottleneck charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ThroughputFlowChart
          flow={report.flow}
          comparison={report.comparison}
          periodLabel={report.periodLabel}
        />
        <BottleneckChart bottlenecks={report.bottlenecks} />
      </div>

      {/* Top Risks / Risk Tasks Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Công việc có tín hiệu rủi ro
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Các task bị tắc nghẽn, quá hạn hoặc vượt quá cam kết thời gian SLA.
            </p>
          </div>
        </div>

        <RiskTaskTable
          tasks={riskData?.tasks || report.topRisks}
          total={riskData?.total || report.topRisks.length}
          limit={riskData?.limit || 20}
          offset={riskOffset}
          onPageChange={onRiskOffsetChange}
        />
      </div>
    </div>
  );
}
