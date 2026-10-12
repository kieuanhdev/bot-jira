"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Timer, TrendingUp } from "lucide-react";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface EffortTabProps {
  member: MemberReportItem;
  analysis: IndividualMemberAnalysis;
}

export function EffortTab({ member, analysis }: EffortTabProps) {
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

  return (
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
  );
}
