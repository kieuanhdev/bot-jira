"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { WorkloadItem } from "@/lib/reports/types";
import { Eye, EyeOff, UserCheck } from "lucide-react";

interface WorkloadChartProps {
  workload: WorkloadItem[];
}

export function WorkloadChart({ workload }: WorkloadChartProps) {
  const [showTable, setShowTable] = useState(false);

  // Take top 8 assignees for visual clarity
  const displayItems = workload.slice(0, 8).map((w) => ({
    name: w.displayName,
    done: w.doneTasks,
    inProgress: w.inProgressTasks,
    blocked: w.blockedTasks,
    other: Math.max(0, w.totalTasks - w.doneTasks - w.inProgressTasks - w.blockedTasks),
    total: w.totalTasks,
    points: w.points,
  }));

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Khối lượng công việc theo Assignee
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Phân bổ nhiệm vụ để hỗ trợ cân bằng workload (không dùng để xếp hạng cá nhân)
          </CardDescription>
        </div>

        <button
          type="button"
          onClick={() => setShowTable(!showTable)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
          aria-label={showTable ? "Ẩn bảng dữ liệu" : "Hiện bảng dữ liệu"}
        >
          {showTable ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          <span>{showTable ? "Biểu đồ" : "Bảng số liệu"}</span>
        </button>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        {showTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-muted-foreground">
                  <th className="py-2 px-3">Người thực hiện</th>
                  <th className="py-2 px-3 text-right">Tổng task</th>
                  <th className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">Hoàn thành</th>
                  <th className="py-2 px-3 text-right text-teal-600 dark:text-teal-400">Đang làm</th>
                  <th className="py-2 px-3 text-right text-red-600 dark:text-red-400">Bị nghẽn</th>
                  <th className="py-2 px-3 text-right">Story Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workload.map((w) => (
                  <tr key={w.assignee} className="hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium">{w.displayName}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold">{w.totalTasks}</td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">{w.doneTasks}</td>
                    <td className="py-2 px-3 text-right font-mono text-teal-600 dark:text-teal-400">{w.inProgressTasks}</td>
                    <td className="py-2 px-3 text-right font-mono text-red-600 dark:text-red-400">{w.blockedTasks}</td>
                    <td className="py-2 px-3 text-right font-mono">{w.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[240px] w-full min-h-[240px]">
            {displayItems.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground italic">
                Chưa có dữ liệu phân công công việc
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayItems}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                >
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    className="text-muted-foreground"
                    width={90}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
                      return (
                        <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs space-y-1">
                          <p className="font-semibold text-foreground">{label}</p>
                          <div className="text-muted-foreground space-y-0.5">
                            <p>Tổng task: <span className="font-semibold text-foreground">{total}</span></p>
                            {payload.map((p) => (
                              <p key={p.name} className="flex justify-between gap-3">
                                <span>{p.name}:</span>
                                <span className="font-mono font-medium text-foreground">{p.value}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconSize={8}
                    formatter={(val) => {
                      const map: Record<string, string> = {
                        done: "Hoàn thành",
                        inProgress: "Đang làm",
                        blocked: "Bị nghẽn",
                        other: "Chờ làm",
                      };
                      return map[val] || val;
                    }}
                  />
                  <Bar dataKey="done" name="done" stackId="a" fill="oklch(0.65 0.15 145)" isAnimationActive={false} />
                  <Bar dataKey="inProgress" name="inProgress" stackId="a" fill="oklch(0.6 0.108 184.7)" isAnimationActive={false} />
                  <Bar dataKey="blocked" name="blocked" stackId="a" fill="oklch(0.6 0.22 25)" isAnimationActive={false} />
                  <Bar dataKey="other" name="other" stackId="a" fill="oklch(0.65 0.15 230)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
