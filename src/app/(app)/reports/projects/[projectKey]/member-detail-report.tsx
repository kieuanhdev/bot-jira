"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClockAlert,
  Flame,
  HelpCircle,
  PieChart as PieChartIcon,
  Radar as RadarIcon,
  ShieldCheck,
  Timer,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MemberReportItem, SupportSignal } from "@/lib/reports/types";
import {
  buildIndividualMemberAnalysis,
  type IndividualMemberAnalysis,
} from "./lib/member-workload-model";

interface MemberDetailReportProps {
  member: MemberReportItem;
  periodLabel: string;
  isVersionScope: boolean;
  onBack: () => void;
  onDrillDownToTasks?: (filter: {
    assignee: string;
    activity?: string;
    memberName?: string;
  }) => void;
  allMembers?: MemberReportItem[];
  onSelectMember?: (assignee: string) => void;
}

type ChartViewTab = "composition" | "radar" | "risk" | "effort";

const SIGNAL_CONFIG: Record<
  SupportSignal,
  { label: string; icon: LucideIcon; className: string; badgeBg: string }
> = {
  balanced: {
    label: "Cân bằng",
    icon: ShieldCheck,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    badgeBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  high_load: {
    label: "Tải cao",
    icon: Flame,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  needs_unblock: {
    label: "Cần gỡ nghẽn",
    icon: AlertTriangle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    badgeBg: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  insufficient_data: {
    label: "Chưa đủ dữ liệu",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
    badgeBg: "bg-muted text-muted-foreground",
  },
};

export function MemberDetailReport({
  member,
  periodLabel,
  isVersionScope,
  onBack,
  onDrillDownToTasks,
  allMembers,
  onSelectMember,
}: MemberDetailReportProps) {
  const [activeTab, setActiveTab] = useState<ChartViewTab>("composition");
  const [hoveredCompositionKey, setHoveredCompositionKey] = useState<string | null>(null);
  const [isPieHovered, setIsPieHovered] = useState(false);

  const signal = SIGNAL_CONFIG[member.supportSignal] || SIGNAL_CONFIG.insufficient_data;
  const SignalIcon = signal.icon;

  const analysis: IndividualMemberAnalysis = useMemo(
    () => buildIndividualMemberAnalysis(member),
    [member]
  );

  // Keyboard navigation: Escape key to return to full member list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Member pagination / quick switcher logic
  const memberIndex = allMembers
    ? allMembers.findIndex((m) => m.assignee === member.assignee)
    : -1;
  const prevMember =
    allMembers && memberIndex > 0 ? allMembers[memberIndex - 1] : null;
  const nextMember =
    allMembers && memberIndex >= 0 && memberIndex < allMembers.length - 1
      ? allMembers[memberIndex + 1]
      : null;

  const drillDown = (activity?: string) => {
    onDrillDownToTasks?.({
      assignee: member.assignee,
      activity,
      memberName: member.displayName,
    });
  };

  // Bar chart data for Risk & Status comparison
  const riskChartData = [
    {
      key: "open",
      label: "Đang mở",
      value: member.assignedOpenTasks,
      color: "var(--chart-1)",
      activity: "current_open",
    },
    {
      key: "wip",
      label: "Đang làm (WIP)",
      value: member.currentWip,
      color: "var(--chart-3)",
      activity: "current_open",
    },
    {
      key: "blocked",
      label: "Bị nghẽn",
      value: member.currentBlocked,
      color: "var(--destructive)",
      activity: "blocked",
    },
    {
      key: "overdue",
      label: "Quá hạn",
      value: member.currentOverdue,
      color: "var(--chart-5)",
      activity: "overdue",
    },
    {
      key: "overSla",
      label: "Vượt SLA",
      value: member.currentOverSla,
      color: "var(--chart-4)",
      activity: "current_open",
    },
  ];

  // Effort comparison chart data
  const effortChartData = [
    {
      key: "completedTasks",
      label: "Task hoàn thành",
      value: member.completedTasks,
      unit: "task",
      color: "var(--chart-2)",
    },
    {
      key: "completedPoints",
      label: "Story Points",
      value: member.completedPoints,
      unit: "pts",
      color: "var(--chart-1)",
    },
    {
      key: "completedHours",
      label: "Giờ công ước tính",
      value: analysis.effortSummary.completedHours,
      unit: "giờ",
      color: "var(--chart-4)",
    },
  ];

  const chartTabs = [
    { id: "composition" as const, label: "Cơ cấu công việc", icon: PieChartIcon },
    { id: "radar" as const, label: "Radar vận hành", icon: RadarIcon },
    { id: "risk" as const, label: "Rủi ro & Trạng thái", icon: BarChart3 },
    { id: "effort" as const, label: "Nỗ lực & Story Points", icon: TrendingUp },
  ];

  return (
    <section className="space-y-4" aria-labelledby="member-report-title">
      {/* Top Navigation & Member Switcher Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
            aria-label="Quay lại danh sách thành viên (Esc)"
            title="Quay lại danh sách thành viên (Esc)"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {/* Member avatar initials badge */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase ring-1 ring-primary/20"
                aria-hidden="true"
              >
                {member.displayName.trim().slice(0, 2)}
              </div>

              <h2
                id="member-report-title"
                className="truncate text-base font-bold text-foreground sm:text-lg"
              >
                {member.displayName}
              </h2>

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${signal.className}`}
              >
                <SignalIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {signal.label}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              {member.assignee !== "unassigned" && (
                <span className="font-mono text-[11px] text-muted-foreground/80">
                  @{member.assignee}
                </span>
              )}
              <span>·</span>
              <span>{periodLabel}</span>
              <span>·</span>
              <span>
                {analysis.totalTasks} task tổng cộng (Tỷ lệ hoàn thành:{" "}
                <strong className="text-foreground">{analysis.completionRate}%</strong>)
              </span>
            </div>
          </div>
        </div>

        {/* Member Quick Switcher & Task Drilldown button */}
        <div className="flex flex-wrap items-center gap-2">
          {allMembers && onSelectMember && allMembers.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={!prevMember}
                onClick={() => prevMember && onSelectMember(prevMember.assignee)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={prevMember ? `Xem ${prevMember.displayName}` : "Đầu danh sách"}
                aria-label="Thành viên trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="w-[170px]">
                <Select
                  value={member.assignee}
                  onValueChange={(val) => onSelectMember(val)}
                >
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue placeholder="Đổi thành viên" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {allMembers.map((m) => (
                      <SelectItem key={m.assignee} value={m.assignee} className="text-xs">
                        {m.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <button
                type="button"
                disabled={!nextMember}
                onClick={() => nextMember && onSelectMember(nextMember.assignee)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={nextMember ? `Xem ${nextMember.displayName}` : "Cuối danh sách"}
                aria-label="Thành viên tiếp theo"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {onDrillDownToTasks && (
            <Button
              type="button"
              onClick={() => drillDown()}
              className="h-8 gap-1 text-xs cursor-pointer transition-transform duration-150 active:scale-95"
            >
              <span>Xem toàn bộ task</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      {/* Top 4 Key Metric Cards */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {/* Metric 1: Total assigned tasks */}
        <div
          onClick={() => drillDown()}
          className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-primary/40 hover:bg-muted/30 hover:-translate-y-0.5"
          title={`Xem tất cả việc của ${member.displayName}`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tổng công việc</span>
            <CircleDot className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
            {analysis.totalTasks}{" "}
            <span className="text-xs font-normal text-muted-foreground">task</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Tiến độ hoàn thành</span>
            <span className="font-semibold text-foreground">{analysis.completionRate}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${analysis.completionRate}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Completed tasks */}
        <div
          onClick={() => drillDown("completed")}
          className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-emerald-500/40 hover:bg-muted/30 hover:-translate-y-0.5"
          title={`Xem việc hoàn thành của ${member.displayName}`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isVersionScope ? "Đã hoàn thành" : "Hoàn thành trong kỳ"}</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {member.completedTasks}
            </span>
            <span className="text-xs font-normal text-muted-foreground">task</span>
            {member.deltaCompletedTasks !== null && member.deltaCompletedTasks !== undefined && (
              <span
                className={`inline-flex items-center text-xs font-medium ${
                  member.deltaCompletedTasks >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}
                title="Thay đổi so với kỳ trước"
              >
                {member.deltaCompletedTasks >= 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                )}
                {Math.abs(member.deltaCompletedTasks)}
              </span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Nỗ lực ghi nhận</span>
            <span className="font-medium text-foreground">
              {member.completedPoints} pts · {analysis.effortSummary.completedHours}h
            </span>
          </div>
        </div>

        {/* Metric 3: In Progress (WIP) */}
        <div
          onClick={() => drillDown("current_open")}
          className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-amber-500/40 hover:bg-muted/30 hover:-translate-y-0.5"
          title={`Xem việc đang làm của ${member.displayName}`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Đang làm (WIP)</span>
            <Flame className="h-4 w-4 text-amber-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {member.currentWip}{" "}
              <span className="text-xs font-normal text-muted-foreground">task</span>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                member.currentWip <= 3
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : member.currentWip <= 4
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : "bg-red-500/15 text-red-600 dark:text-red-400"
              }`}
            >
              {member.currentWip <= 3 ? "Tối ưu" : member.currentWip <= 4 ? "Tải cao" : "Quá tải"}
            </span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Tỷ trọng tải</span>
            <span className="font-medium text-foreground">
              {analysis.composition.find((c) => c.key === "wip")?.percentage || 0}% tổng việc
            </span>
          </div>
        </div>

        {/* Metric 4: Blocked & Overdue Risks */}
        <div
          onClick={() => drillDown(member.currentBlocked > 0 ? "blocked" : "overdue")}
          className="group cursor-pointer rounded-xl border border-border bg-card p-3.5 shadow-2xs transition-all duration-200 hover:border-destructive/40 hover:bg-muted/30 hover:-translate-y-0.5"
          title={`Xem việc rủi ro của ${member.displayName}`}
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Tắc nghẽn & Quá hạn</span>
            <ClockAlert
              className={`h-4 w-4 ${
                member.currentBlocked > 0 || member.currentOverdue > 0
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tabular-nums ${
                member.currentBlocked > 0 || member.currentOverdue > 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              {member.currentBlocked + member.currentOverdue}
            </span>
            <span className="text-xs font-normal text-muted-foreground">task rủi ro</span>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>Chi tiết rủi ro</span>
            <span className="font-medium text-foreground">
              {member.currentBlocked > 0 ? `${member.currentBlocked} nghẽn` : "0 nghẽn"} ·{" "}
              {member.currentOverdue > 0 ? `${member.currentOverdue} trễ` : "0 trễ"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Diagram & Analysis Card with Rich View Tabs */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-card/60 p-4 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Sơ đồ phân tích công việc của {member.displayName}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Khảo sát toàn diện về cơ cấu công việc, sức khỏe vận hành và các chỉ số nỗ lực.
              </CardDescription>
            </div>

            {/* View Mode Segmented Controls */}
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {chartTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer transition-all duration-150 ${
                      isActive
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {/* TAB 1: WORKLOAD COMPOSITION (DONUT + INTERACTIVE BREAKDOWN) */}
          {activeTab === "composition" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                {/* Donut Chart with center metric */}
                <div className="relative flex flex-col items-center justify-center lg:col-span-5">
                  <div
                    className="relative h-64 w-full max-w-[280px]"
                    role="img"
                    aria-label={`Biểu đồ cơ cấu ${analysis.totalTasks} task của ${member.displayName}`}
                  >
                    <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                      <PieChart>
                        <Pie
                          data={analysis.composition.filter((c) => c.count > 0)}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={104}
                          paddingAngle={analysis.composition.filter((c) => c.count > 0).length > 1 ? 3 : 0}
                          stroke="var(--card)"
                          strokeWidth={2}
                          isAnimationActive={true}
                          animationDuration={400}
                          onMouseEnter={(_, index) => {
                            setIsPieHovered(true);
                            const filtered = analysis.composition.filter((c) => c.count > 0);
                            setHoveredCompositionKey(filtered[index]?.key ?? null);
                          }}
                          onMouseLeave={() => {
                            setIsPieHovered(false);
                            setHoveredCompositionKey(null);
                          }}
                          onClick={(entry) => {
                            const itemKey = (entry as { key?: string }).key;
                            if (itemKey === "done") drillDown("completed");
                            else if (itemKey === "blocked") drillDown("blocked");
                            else drillDown("current_open");
                          }}
                          className="cursor-pointer"
                        >
                          {analysis.composition
                            .filter((c) => c.count > 0)
                            .map((item) => (
                              <Cell
                                key={item.key}
                                fill={item.color}
                                opacity={
                                  hoveredCompositionKey && hoveredCompositionKey !== item.key ? 0.4 : 1
                                }
                                className="transition-opacity duration-200"
                              />
                            ))}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0].payload as (typeof analysis.composition)[number];
                            return (
                              <div className="min-w-44 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-2xl">
                                <div className="mb-1 font-semibold text-foreground flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: item.color }}
                                  />
                                  <span>{item.label}</span>
                                </div>
                                <div className="text-muted-foreground">
                                  <div>
                                    Số lượng: <strong className="text-foreground">{item.count} task</strong>
                                  </div>
                                  <div>
                                    Tỷ trọng: <strong className="text-foreground">{item.percentage}%</strong>
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground/80">
                                    {item.description}
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Donut center metrics */}
                    <div
                      className={`pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center transition-opacity duration-200 ${
                        isPieHovered ? "opacity-0" : "opacity-100"
                      }`}
                      aria-hidden="true"
                    >
                      <span className="text-xs font-medium text-muted-foreground">
                        {hoveredCompositionKey
                          ? analysis.composition.find((c) => c.key === hoveredCompositionKey)?.label
                          : "Tỷ lệ hoàn thành"}
                      </span>
                      <span className="text-3xl font-extrabold tabular-nums text-foreground">
                        {hoveredCompositionKey
                          ? `${analysis.composition.find((c) => c.key === hoveredCompositionKey)?.count} task`
                          : `${analysis.completionRate}%`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {hoveredCompositionKey
                          ? `${analysis.composition.find((c) => c.key === hoveredCompositionKey)?.percentage}% tỷ trọng`
                          : `${member.completedTasks} / ${analysis.totalTasks} task`}
                      </span>
                    </div>
                  </div>
                  <p className="text-center text-[11px] text-muted-foreground mt-2">
                    Rê chuột để xem tỷ trọng · Nhấp vào lát bánh để xem task
                  </p>
                </div>

                {/* Right: 4 status breakdown cards */}
                <div className="space-y-2 lg:col-span-7">
                  <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wider">
                      Cơ cấu 4 trạng thái công việc
                    </span>
                    <span>Tổng {analysis.totalTasks} task</span>
                  </div>

                  {analysis.composition.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        if (item.key === "done") drillDown("completed");
                        else if (item.key === "blocked") drillDown("blocked");
                        else drillDown("current_open");
                      }}
                      onMouseEnter={() => setHoveredCompositionKey(item.key)}
                      onMouseLeave={() => setHoveredCompositionKey(null)}
                      className={`group block w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-150 ${
                        hoveredCompositionKey === item.key
                          ? "border-primary/50 bg-accent/40 shadow-xs"
                          : "border-border/70 bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                            aria-hidden="true"
                          />
                          <div>
                            <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                              {item.label}
                            </div>
                            <div className="text-[11px] text-muted-foreground line-clamp-1">
                              {item.description}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-3 text-xs">
                          <span className="text-sm font-bold text-foreground">
                            {item.count}{" "}
                            <span className="text-xs font-normal text-muted-foreground">task</span>
                          </span>
                          <span className="w-12 text-right font-semibold text-muted-foreground">
                            {item.percentage}%
                          </span>
                          <ArrowRight
                            className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      {/* Bar indicator */}
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-[width] duration-300"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bottom Proportional Flow Strip */}
              <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Dòng chảy phân bổ toàn diện (Delivery Pipeline Flow)
                  </span>
                  <span>100% Khối lượng</span>
                </div>

                {/* Stacked multi-color progress strip */}
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                  {analysis.composition.map((item) =>
                    item.percentage > 0 ? (
                      <div
                        key={item.key}
                        style={{
                          width: `${item.percentage}%`,
                          backgroundColor: item.color,
                        }}
                        title={`${item.label}: ${item.count} task (${item.percentage}%)`}
                        className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                      />
                    ) : null
                  )}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  {analysis.composition.map((item) => (
                    <div key={item.key} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>
                        {item.label}: <strong className="text-foreground">{item.count}</strong> ({item.percentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPERATIONAL HEALTH RADAR */}
          {activeTab === "radar" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                {/* Radar Chart */}
                <div className="relative flex flex-col items-center justify-center lg:col-span-5">
                  <div
                    className="relative h-72 w-full max-w-[320px]"
                    role="img"
                    aria-label={`Sơ đồ radar sức khỏe vận hành của ${member.displayName}`}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={analysis.operationalMetrics}>
                        <PolarGrid stroke="var(--border)" strokeOpacity={0.8} />
                        <PolarAngleAxis
                          dataKey="metric"
                          tick={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 500 }}
                        />
                        <PolarRadiusAxis
                          angle={90}
                          domain={[0, 100]}
                          stroke="var(--border)"
                          tick={false}
                          axisLine={false}
                        />
                        <Radar
                          name="Điểm sức khỏe"
                          dataKey="score"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          fill="var(--primary)"
                          fillOpacity={0.3}
                          isAnimationActive={true}
                          animationDuration={500}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0].payload as (typeof analysis.operationalMetrics)[number];
                            return (
                              <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
                                <div className="font-semibold text-foreground">{item.metric}</div>
                                <div className="mt-1 text-muted-foreground">
                                  Điểm: <strong className="text-foreground">{item.score}/100</strong>
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {item.description} ({item.valueDisplay})
                                </div>
                              </div>
                            );
                          }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Health summary badge under radar */}
                  <div className="mt-2 text-center">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-2xs">
                      <span className="text-xs font-medium text-muted-foreground">Điểm vận hành:</span>
                      <span className="text-sm font-bold text-foreground">
                        {analysis.healthScore}/100
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          analysis.healthAssessment.status === "optimal"
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : analysis.healthAssessment.status === "attention"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {analysis.healthAssessment.status === "optimal"
                          ? "Tối ưu"
                          : analysis.healthAssessment.status === "attention"
                          ? "Cần lưu ý"
                          : "Cần hỗ trợ"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: 5 Operational Dimension Detail Bars */}
                <div className="space-y-3 lg:col-span-7">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      5 Trục đánh giá độ mượt dòng việc
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Đo lường từ dữ liệu thực tế giúp nhóm phát hiện tải cao hoặc nguy cơ quá hạn.
                    </p>
                  </div>

                  {analysis.operationalMetrics.map((m) => (
                    <div
                      key={m.metric}
                      className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{m.metric}</span>
                          <span className="text-[11px] text-muted-foreground">
                            ({m.valueDisplay})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              m.status === "good"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                : m.status === "warning"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                : "bg-red-500/15 text-red-600 dark:text-red-400"
                            }`}
                          >
                            {m.status === "good" ? "Tốt" : m.status === "warning" ? "Cảnh báo" : "Rủi ro"}
                          </span>
                          <span className="font-mono text-xs font-bold text-foreground">
                            {m.score}/100
                          </span>
                        </div>
                      </div>

                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            m.status === "good"
                              ? "bg-emerald-500"
                              : m.status === "warning"
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                          style={{ width: `${m.score}%` }}
                        />
                      </div>

                      <p className="text-[11px] text-muted-foreground">{m.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RISK & BOTTLENECK ANALYSIS */}
          {activeTab === "risk" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Vertical Bar Chart */}
                <div className="lg:col-span-7">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      So sánh các lát cắt công việc & rủi ro
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      WIP, nghẽn, quá hạn và vượt SLA phản ánh các yếu tố cần hỗ trợ.
                    </p>
                  </div>

                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={riskChartData}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
                      >
                        <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          dataKey="label"
                          type="category"
                          width={96}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0].payload as (typeof riskChartData)[number];
                            return (
                              <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
                                <p className="font-semibold">{item.label}</p>
                                <p className="mt-1 text-muted-foreground">
                                  Số lượng: <strong className="text-foreground">{item.value}</strong> task
                                </p>
                                <p className="text-[10px] text-primary mt-1">
                                  Nhấp vào cột để xem danh sách task
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="value"
                          radius={[0, 6, 6, 0]}
                          isAnimationActive={true}
                          animationDuration={400}
                          onClick={(entry) => {
                            const act = (entry as { activity?: string }).activity;
                            drillDown(act);
                          }}
                          className="cursor-pointer"
                        >
                          {riskChartData.map((item) => (
                            <Cell key={item.key} fill={item.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right: Support Signal Card & Recommendations */}
                <div className="space-y-4 lg:col-span-5">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
                    <div className="flex items-center gap-2">
                      <SignalIcon className="h-5 w-5 text-primary" aria-hidden="true" />
                      <h4 className="text-sm font-semibold text-foreground">
                        Tín hiệu hỗ trợ hiện tại
                      </h4>
                    </div>

                    <div className={`p-3 rounded-lg border ${signal.className} space-y-1`}>
                      <div className="font-bold text-xs">{analysis.healthAssessment.title}</div>
                      <p className="text-xs opacity-90">{analysis.healthAssessment.description}</p>
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-foreground">
                        Chi tiết các cảnh báo:
                      </span>
                      {member.supportReasons.length > 0 ? (
                        <ul className="space-y-1.5 text-xs text-muted-foreground">
                          {member.supportReasons.map((reason, idx) => (
                            <li key={idx} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                              <span>{reason}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          <ShieldCheck className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                          Không có cảnh báo tắc nghẽn hay trễ hạn nào.
                        </div>
                      )}
                    </div>

                    {/* Operational advice */}
                    <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
                      <strong className="text-foreground">Đề xuất điều phối:</strong>{" "}
                      {member.currentBlocked > 0
                        ? "Ưu tiên tổ chức daily để làm rõ blocker và liên hệ người phụ thuộc."
                        : member.currentWip >= 4
                        ? "Hạn chế nhận thêm task mới, tập trung kết thúc các task đang WIP."
                        : "Khối lượng đang cân bằng lý tưởng, duy trì nhịp độ hiện tại."}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: EFFORT & STORY POINTS */}
          {activeTab === "effort" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
                {/* Left: Bar comparison */}
                <div className="lg:col-span-7">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      Chỉ số nỗ lực & Khối lượng hoàn thành
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Tổng hợp Story Points, giờ công ước tính và số lượng task đã giao nhận.
                    </p>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={effortChartData}
                        margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.6} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "currentColor", fontSize: 11 }}
                          className="text-muted-foreground"
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const item = payload[0].payload as (typeof effortChartData)[number];
                            return (
                              <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
                                <p className="font-semibold text-foreground">{item.label}</p>
                                <p className="mt-1 text-muted-foreground">
                                  Giá trị: <strong className="text-foreground">{item.value}</strong> {item.unit}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar
                          dataKey="value"
                          radius={[6, 6, 0, 0]}
                          isAnimationActive={true}
                          animationDuration={400}
                        >
                          {effortChartData.map((item) => (
                            <Cell key={item.key} fill={item.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right: Detailed Velocity Cards */}
                <div className="grid grid-cols-2 gap-3 lg:col-span-5">
                  <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Story Points</span>
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-foreground">
                      {member.completedPoints} <span className="text-xs font-normal text-muted-foreground">pts</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Trung bình: {analysis.effortSummary.avgPointsPerTask} pts / task
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Giờ công hoàn thành</span>
                      <Timer className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-foreground">
                      {analysis.effortSummary.completedHours} <span className="text-xs font-normal text-muted-foreground">giờ</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1">
                      Trung bình: {analysis.effortSummary.avgHoursPerTask}h / task
                    </p>
                  </div>

                  <div className="col-span-2 rounded-xl border border-border bg-card p-4 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        Xu hướng so với kỳ trước
                      </span>
                      {member.deltaCompletedTasks !== null && member.deltaCompletedTasks !== undefined ? (
                        <span
                          className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                            member.deltaCompletedTasks >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          {member.deltaCompletedTasks >= 0 ? "+" : ""}
                          {member.deltaCompletedTasks} task
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Kỳ đầu tiên</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {member.deltaCompletedTasks && member.deltaCompletedTasks > 0
                        ? `Số lượng task hoàn thành tăng ${member.deltaCompletedTasks} task so với kỳ so sánh trước.`
                        : member.deltaCompletedTasks && member.deltaCompletedTasks < 0
                        ? `Số lượng task hoàn thành giảm ${Math.abs(member.deltaCompletedTasks)} task so với kỳ trước.`
                        : "Tốc độ hoàn thành tương đương kỳ trước hoặc chưa ghi nhận dữ liệu so sánh."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
