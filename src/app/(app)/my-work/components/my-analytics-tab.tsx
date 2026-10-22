"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { myWorkKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  TrendingUp,
  Clock,
  PieChart as PieIcon,
  CheckCircle2,
  Hourglass,
  Gauge,
} from "lucide-react";
import type { MyWorkAnalytics } from "@/lib/my-work/service";

const TYPE_COLORS: Record<string, string> = {
  Story: "#0D9488", // Teal
  Bug: "#E11D48", // Rose/Red
  Task: "#3B82F6", // Blue
  "Sub-task": "#8B5CF6", // Purple
  Improvement: "#F59E0B", // Amber
};

const DEFAULT_COLORS = ["#0D9488", "#3B82F6", "#E11D48", "#8B5CF6", "#F59E0B", "#10B981"];

export function MyAnalyticsTab() {
  const { data, isLoading } = useQuery<MyWorkAnalytics>({
    queryKey: myWorkKeys.analytics(8),
    queryFn: () => api<MyWorkAnalytics>("/api/my-work/analytics?weeks=8"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-lg lg:col-span-2" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-56 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data || data.velocityByWeek.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Chưa có dữ liệu thống kê hiệu suất"
        hint="Khi bạn bắt đầu hoàn thành các task và cập nhật tiến độ, biểu đồ vận tốc và chu kỳ sẽ tự động được ghi nhận tại đây."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top row: Velocity & Cycle Time summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly Velocity Chart */}
        <Card className="lg:col-span-2 border-border shadow-xs">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" aria-hidden="true" />
                <span>Personal Velocity (Vận tốc công việc 8 tuần qua)</span>
              </CardTitle>
              <span className="text-2xs text-muted-foreground">Task & Story Points hoàn thành</span>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.velocityByWeek} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="weekLabel"
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                      color: "hsl(var(--foreground))",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
                  />
                  <Bar
                    dataKey="tasksDone"
                    name="Số Task hoàn thành"
                    fill="#0D9488"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="pointsDone"
                    name="Story Points tích lũy"
                    fill="#6366F1"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Lead Time & Cycle Time KPI Gauge */}
        <Card className="border-border shadow-xs flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Gauge className="w-4 h-4 text-primary" aria-hidden="true" />
              <span>Tốc độ xử lý (Cycle & Lead Time)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-1 flex-1 flex flex-col justify-around">
            {/* Cycle Time */}
            <div className="p-3.5 bg-muted/50 rounded-lg border border-border/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  Cycle Time trung bình
                </span>
                <span className="text-xs font-semibold text-primary">
                  {data.cycleTimeStats.avgCycleTimeDays} ngày
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">
                Thời gian trung bình từ lúc task chuyển sang Đang làm (In Progress) đến khi Hoàn thành (Done).
              </p>
            </div>

            {/* Lead Time */}
            <div className="p-3.5 bg-muted/50 rounded-lg border border-border/80">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Hourglass className="w-3.5 h-3.5 text-info" aria-hidden="true" />
                  Lead Time trung bình
                </span>
                <span className="text-xs font-semibold text-info">
                  {data.cycleTimeStats.avgLeadTimeDays} ngày
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">
                Tổng thời gian từ khi task được tạo trong hệ thống đến khi bàn giao xong.
              </p>
            </div>

            <div className="text-2xs text-muted-foreground text-center">
              Dựa trên mẫu <strong>{data.cycleTimeStats.sampleCount}</strong> công việc đã hoàn thành gần đây.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Type Distribution & Active Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Task Type Donut Chart */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-primary" aria-hidden="true" />
              <span>Phân bổ công việc theo loại (Task Type Distribution)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {data.typeDistribution.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">
                Chưa có dữ liệu loại task
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-56">
                <div className="w-full sm:w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.typeDistribution}
                        dataKey="count"
                        nameKey="type"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                      >
                        {data.typeDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={TYPE_COLORS[entry.type] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          borderColor: "hsl(var(--border))",
                          borderRadius: "0.5rem",
                          fontSize: "12px",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="w-full sm:w-1/2 space-y-2">
                  {data.typeDistribution.map((item, idx) => (
                    <div key={item.type} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              TYPE_COLORS[item.type] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
                          }}
                        />
                        <span className="text-foreground">{item.type}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-medium">
                        <span className="text-muted-foreground">{item.count} task</span>
                        <span className="text-foreground font-semibold">({item.percentage}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Current Active Status Breakdown */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden="true" />
              <span>Phân bố trạng thái công việc hiện tại</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {data.statusDistribution.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">
                Hiện không có task nào đang active
              </div>
            ) : (
              <div className="space-y-3.5 pt-2">
                {data.statusDistribution.map((s) => {
                  const isDone = s.statusCategory.toLowerCase() === "done";
                  const colorClass = isDone
                    ? "bg-success"
                    : s.statusCategory.toLowerCase() === "indeterminate"
                    ? "bg-primary"
                    : "bg-muted-foreground";

                  return (
                    <div key={s.status} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-foreground">{s.status}</span>
                        <span className="text-muted-foreground font-semibold">{s.count} task</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${colorClass}`}
                          style={{ width: `${Math.min(100, s.count * 20)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
