"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberReportItem } from "@/lib/reports/types";
import { buildMemberWorkloadReport } from "./lib/member-workload-model";

interface MemberWorkloadChartProps {
  members: MemberReportItem[];
  periodLabel: string;
  onSelectMember: (member: MemberReportItem) => void;
}

export function MemberWorkloadChart({
  members,
  periodLabel,
  onSelectMember,
}: MemberWorkloadChartProps) {
  const { items, summary } = useMemo(() => buildMemberWorkloadReport(members), [members]);
  const [hoveredAssignee, setHoveredAssignee] = useState<string | null>(null);
  const [isPieHovered, setIsPieHovered] = useState(false);
  const focused = items.find((item) => item.assignee === hoveredAssignee) ?? null;
  const chartItems = items.filter((item) => item.totalTasks > 0);

  const summaryCards = [
    { label: "Thành viên", value: summary.memberCount, suffix: "người", icon: Users },
    { label: "Tổng công việc", value: summary.totalTasks, suffix: "task", icon: CircleDot },
    { label: "Hoàn thành", value: summary.completedTasks, suffix: "task", icon: CheckCircle2 },
    { label: "Cần hỗ trợ", value: summary.needsSupportCount, suffix: "người", icon: AlertTriangle },
  ];

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border/60 bg-card/60 p-4 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </div>
                <CardTitle className="text-base font-semibold">Phân bổ công việc theo thành viên</CardTitle>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-muted/80 px-2.5 py-0.5 text-xs font-medium text-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                {periodLabel}
              </span>
            </div>
            <CardDescription className="text-xs">
              Khối lượng gồm task hoàn thành trong phạm vi báo cáo và task đang mở hiện tại.
            </CardDescription>
          </div>
          <div className="text-xs text-muted-foreground">
            {summary.currentWip} đang làm · {summary.blockedTasks} bị nghẽn
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 lg:grid-cols-4">
          {summaryCards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{item.label}</span>
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums text-foreground">
                  {item.value} <span className="text-[11px] font-normal text-muted-foreground">{item.suffix}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
          <div className="relative flex flex-col items-center justify-center lg:col-span-5">
            <div
              className="relative h-64 w-full max-w-[300px]"
              role="img"
              aria-label={`Biểu đồ phân bổ ${summary.totalTasks} task theo thành viên`}
            >
              <ResponsiveContainer width="100%" height="100%" className="relative z-10">
                <PieChart>
                  <Pie
                    data={chartItems}
                    dataKey="totalTasks"
                    nameKey="displayName"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={chartItems.length > 1 ? 3 : 0}
                    stroke="var(--card)"
                    strokeWidth={2}
                    isAnimationActive={false}
                    onMouseEnter={(_, index) => {
                      setIsPieHovered(true);
                      setHoveredAssignee(chartItems[index]?.assignee ?? null);
                    }}
                    onMouseLeave={() => {
                      setIsPieHovered(false);
                      setHoveredAssignee(null);
                    }}
                    onClick={(entry) => {
                      const assignee = (entry as { assignee?: string }).assignee;
                      const member = items.find((item) => item.assignee === assignee);
                      if (member) onSelectMember(member);
                    }}
                    className="cursor-pointer"
                  >
                    {chartItems.map((item) => (
                      <Cell
                        key={item.assignee}
                        fill={item.color}
                        opacity={hoveredAssignee && hoveredAssignee !== item.assignee ? 0.35 : 1}
                        className="transition-opacity duration-200"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as (typeof items)[number];
                      return (
                        <div className="min-w-44 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-2xl">
                          <div className="mb-2 font-semibold text-foreground">{item.displayName}</div>
                          <div className="space-y-1 text-muted-foreground">
                            <div className="flex justify-between gap-4"><span>Tổng công việc</span><strong className="text-foreground">{item.totalTasks}</strong></div>
                            <div className="flex justify-between gap-4"><span>Hoàn thành</span><strong className="text-foreground">{item.completedTasks}</strong></div>
                            <div className="flex justify-between gap-4"><span>Đang mở</span><strong className="text-foreground">{item.assignedOpenTasks}</strong></div>
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div
                className={`pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center transition-opacity duration-200 ${
                  isPieHovered ? "opacity-0" : "opacity-100"
                }`}
                aria-hidden="true"
              >
                <span className="max-w-28 truncate text-xs font-medium text-muted-foreground">
                  {focused?.displayName ?? "Tổng công việc"}
                </span>
                <span className="text-3xl font-extrabold tabular-nums text-foreground">
                  {focused?.totalTasks ?? summary.totalTasks}
                </span>
                <span className="text-xs text-muted-foreground">
                  {focused ? `${focused.percentage}% tổng tải` : `${summary.memberCount} thành viên`}
                </span>
              </div>
            </div>
            <p className="text-center text-[11px] text-muted-foreground">Rê chuột hoặc nhấp để xem chi tiết</p>
          </div>

          <div className="lg:col-span-7">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-semibold uppercase tracking-wider">Chi tiết theo thành viên</span>
              <span>Tổng {summary.totalTasks} task</span>
            </div>
            <div className="max-h-[330px] space-y-1.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <button
                  key={item.assignee}
                  type="button"
                  onClick={() => onSelectMember(item)}
                  onMouseEnter={() => setHoveredAssignee(item.assignee)}
                  onMouseLeave={() => setHoveredAssignee(null)}
                  title={`Nhấp để xem báo cáo cá nhân của ${item.displayName}`}
                  className="group block w-full cursor-pointer rounded-lg border border-border/70 bg-card p-2.5 text-left transition-all duration-200 hover:bg-muted/60 hover:translate-x-1 hover:border-primary/40 active:scale-[0.99] motion-reduce:hover:translate-none"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-foreground">{item.displayName}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <span><strong className="text-foreground">{item.totalTasks}</strong> task</span>
                      <span className="hidden text-muted-foreground sm:inline">{item.completedTasks} xong · {item.currentWip} WIP</span>
                      <span className="w-10 text-right font-semibold text-muted-foreground">{item.percentage}%</span>
                      <ArrowRight className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
                      style={{ width: `${item.percentage}%`, backgroundColor: item.color }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
