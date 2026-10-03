"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  HelpCircle,
  ArrowRight,
  FolderKanban,
  TrendingUp,
  TrendingDown,
  Minus,
  type LucideIcon,
} from "lucide-react";
import type { ProjectReportSummary, HealthStatus, ReportPeriod } from "@/lib/reports/types";

interface ProjectReportTableProps {
  projects: ProjectReportSummary[];
  period: ReportPeriod;
  unit: string;
}

const HEALTH_CONFIG: Record<
  HealthStatus,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary"; icon: LucideIcon }
> = {
  at_risk: { label: "Rủi ro cao", variant: "danger", icon: AlertOctagon },
  attention: { label: "Cần chú ý", variant: "warning", icon: AlertTriangle },
  healthy: { label: "Ổn định", variant: "success", icon: CheckCircle2 },
  completed: { label: "Hoàn thành", variant: "info", icon: Trophy },
  unknown: { label: "Chưa đủ dữ liệu", variant: "secondary", icon: HelpCircle },
};

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
  if (!isoString) return "Chưa đồng bộ";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Vừa xong";
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return date.toLocaleDateString("vi-VN");
}

export function ProjectReportTable({ projects, period, unit }: ProjectReportTableProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
        <div className="p-3 rounded-full bg-muted text-muted-foreground mb-3">
          <FolderKanban className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-base font-semibold">Chưa có dự án để báo cáo</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Kiểm tra cấu hình danh mục dự án hoặc tùy chọn bảng làm việc của bạn trong phần Cài đặt.
        </p>
      </div>
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
            <th className="py-3 px-4 text-right">Chi tiết</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.map((p) => {
            const healthCfg = HEALTH_CONFIG[p.health] || HEALTH_CONFIG.unknown;
            const HealthIcon = healthCfg.icon;
            const unitLabel = formatUnitLabel(p.unit);
            const topReason = p.healthReasons?.[0]?.message;

            const detailHref = `/reports/projects/${p.projectKey}?period=${period.preset}&from=${period.from}&to=${period.to}&unit=${unit}`;

            return (
              <tr
                key={p.projectKey}
                className="hover:bg-muted/30 transition-colors duration-150 group"
              >
                {/* Project */}
                <td className="py-3.5 px-4 font-medium">
                  <Link
                    href={detailHref}
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
                  <span className="text-teal-600 dark:text-teal-400">
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
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-600 dark:text-red-400">
                      {p.blockedAtEnd}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">0</span>
                  )}
                </td>

                {/* Overdue */}
                <td className="py-3.5 px-4 text-center">
                  {p.overdueAtEnd > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
                        <TrendingUp className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
                        <span className="text-amber-600 dark:text-amber-400">
                          +{p.netBacklogChange}
                        </span>
                      </>
                    ) : p.netBacklogChange < 0 ? (
                      <>
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                        <span className="text-emerald-600 dark:text-emerald-400">
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
                        className="text-[11px] text-muted-foreground line-clamp-1 max-w-[200px]"
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
                <td className="py-3.5 px-4 text-right">
                  <Link
                    href={detailHref}
                    className="inline-flex items-center justify-center p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
                    title={`Xem chi tiết ${p.projectName}`}
                    aria-label={`Xem chi tiết ${p.projectName}`}
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
