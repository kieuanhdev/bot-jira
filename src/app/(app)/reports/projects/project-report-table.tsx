"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import { api } from "@/lib/api-client";
import { formatRelative } from "@/lib/format/time";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";

import {
  ArrowRight,
  FolderKanban,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
} from "lucide-react";
import type { ProjectReportSummary, ReportPeriod } from "@/lib/reports/types";
import { HEALTH_CONFIG } from "@/lib/reports/health-style";

interface ProjectReportTableProps {
  projects: ProjectReportSummary[];
  period: ReportPeriod;
  unit: string;
}

function formatUnitLabel(unit: string): string {
  switch (unit) {
    case "points":
      return "pts";
    case "estimate":
      return "h";
    default:
      return "task";
  }
}

function formatRelativeTime(isoString: string | null): string {
  return formatRelative(isoString, { locale: "vi", empty: "Chưa đồng bộ" });
}

export function ProjectReportTable({ projects, period, unit }: ProjectReportTableProps) {
  const queryClient = useQueryClient();

  const handlePrefetchProject = (projectKey: string) => {
    const queryParams: Record<string, string> = {
      period: period.preset,
      from: period.from,
      to: period.to,
      timezone: period.timezone,
    };
    if (unit !== "auto") queryParams.unit = unit;

    void queryClient.prefetchQuery({
      queryKey: reportsKeys.project(projectKey, queryParams),
      queryFn: () => {
        const sp = new URLSearchParams(queryParams);
        return api(`/api/reports/projects/${projectKey}?${sp.toString()}`);
      },
      staleTime: queryPolicy.reports.projectDetail.staleTime,
    });
  };

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Chưa có dự án để báo cáo"
        hint="Kiểm tra cấu hình danh mục dự án hoặc tùy chọn bảng làm việc của bạn trong phần Cài đặt."
        className="bg-card"
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="py-3 px-4">Dự án</th>
            <th className="py-3 px-4">Kỳ báo cáo</th>
            <th className="py-3 px-4 text-center">Hoàn thành trong kỳ</th>
            <th className="py-3 px-4 text-center">Tồn cuối kỳ (Open/WIP)</th>
            <th className="py-3 px-4 text-center">Bị nghẽn</th>
            <th className="py-3 px-4 text-center">Quá hạn</th>
            <th className="py-3 px-4 text-center">Thay đổi Backlog</th>
            <th className="py-3 px-4">Sức khỏe</th>
            <th className="py-3 px-4">Đồng bộ</th>
            <th className="py-3 px-4 text-right">Báo cáo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.map((p) => {
            const healthCfg = HEALTH_CONFIG[p.health] || HEALTH_CONFIG.unknown;
            const HealthIcon = healthCfg.icon;
            const unitLabel = formatUnitLabel(p.unit);
            const topReason = p.healthReasons?.[0]?.message;

            const detailHref = `/reports/projects/${p.projectKey}?period=${period.preset}&from=${period.from}&to=${period.to}&unit=${unit}`;
            const membersHref = `${detailHref}&tab=members`;

            return (
              <tr
                key={p.projectKey}
                className="hover:bg-muted/30 transition-colors duration-150 group"
              >
                {/* Project */}
                <td className="py-3.5 px-4 font-medium">
                  <Link
                    href={detailHref}
                    onMouseEnter={() => handlePrefetchProject(p.projectKey)}
                    onFocus={() => handlePrefetchProject(p.projectKey)}
                    className="flex flex-col group-hover:text-primary transition-colors cursor-pointer"
                  >
                    <span className="font-semibold text-foreground group-hover:text-primary">
                      {p.projectName}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {p.projectKey}
                    </span>
                  </Link>
                </td>


                {/* Period */}
                <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {p.periodLabel || `${period.from} - ${period.to}`}
                </td>

                {/* Completed in Period */}
                <td className="py-3.5 px-4 text-center font-semibold text-foreground">
                  <span className="text-primary font-semibold">
                    {p.completedInPeriod}
                  </span>{" "}
                  <span className="text-xs font-normal text-muted-foreground">{unitLabel}</span>
                </td>

                {/* Open at End (Open / WIP) */}
                <td className="py-3.5 px-4 text-center font-medium">
                  <span>{p.openAtEnd}</span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({p.wipAtEnd} đang làm)
                  </span>
                </td>

                {/* Blocked */}
                <td className="py-3.5 px-4 text-center">
                  {p.blockedAtEnd > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                      {p.blockedAtEnd}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">0</span>
                  )}
                </td>

                {/* Overdue */}
                <td className="py-3.5 px-4 text-center">
                  {p.overdueAtEnd > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                      {p.overdueAtEnd}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">0</span>
                  )}
                </td>

                {/* Net Backlog Change */}
                <td className="py-3.5 px-4 text-center">
                  <div className="inline-flex items-center gap-1 text-xs font-medium">
                    {p.netBacklogChange > 0 ? (
                      <>
                        <TrendingUp className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                        <span className="text-warning">
                          +{p.netBacklogChange}
                        </span>
                      </>
                    ) : p.netBacklogChange < 0 ? (
                      <>
                        <TrendingDown className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                        <span className="text-success">
                          {p.netBacklogChange}
                        </span>
                      </>
                    ) : (
                      <>
                        <Minus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        <span className="text-muted-foreground">0</span>
                      </>
                    )}
                  </div>
                </td>

                {/* Health */}
                <td className="py-3.5 px-4">
                  <div className="flex flex-col gap-1 items-start">
                    <Badge variant={healthCfg.variant} className="gap-1 font-medium">
                      <HealthIcon className="h-3 w-3" aria-hidden="true" />
                      {healthCfg.label}
                    </Badge>
                    {topReason && (
                      <span
                        className="text-2xs text-muted-foreground line-clamp-1 max-w-[200px]"
                        title={topReason}
                      >
                        {topReason}
                      </span>
                    )}
                  </div>
                </td>

                {/* Last Synced */}
                <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(p.lastSyncedAt)}
                </td>

                {/* Action */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={membersHref}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                      title={`Xem báo cáo thành viên của ${p.projectName}`}
                    >
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                      Thành viên
                    </Link>
                    <Link
                      href={detailHref}
                      className="inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title={`Xem báo cáo dự án ${p.projectName}`}
                      aria-label={`Xem báo cáo dự án ${p.projectName}`}
                    >
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
