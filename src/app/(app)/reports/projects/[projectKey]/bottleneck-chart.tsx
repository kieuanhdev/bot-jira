"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { BottleneckItem } from "@/lib/reports/types";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

interface BottleneckChartProps {
  bottlenecks: BottleneckItem[];
}

export function BottleneckChart({ bottlenecks }: BottleneckChartProps) {
  const [showTable, setShowTable] = useState(false);

  const displayItems = bottlenecks.slice(0, 6).map((b) => ({
    status: b.status,
    overSla: b.overSlaCount,
    taskCount: b.taskCount,
    avgAge: b.avgStateAgeDays,
  }));

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
            Điểm nghẽn quy trình (Bottlenecks)
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Số lượng task vượt ngưỡng thời hạn trạng thái (SLA) theo từng bước
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
                  <th className="py-2 px-3">Trạng thái</th>
                  <th className="py-2 px-3 text-right text-red-600 dark:text-red-400">Vượt SLA</th>
                  <th className="py-2 px-3 text-right">Tổng task tại trạng thái</th>
                  <th className="py-2 px-3 text-right">Thời gian lưu TB (ngày)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bottlenecks.map((b) => (
                  <tr key={b.status} className="hover:bg-muted/20">
                    <td className="py-2 px-3 font-medium">{b.status}</td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-red-600 dark:text-red-400">
                      {b.overSlaCount}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{b.taskCount}</td>
                    <td className="py-2 px-3 text-right font-mono">{b.avgStateAgeDays} ngày</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-[220px] w-full min-h-[220px]">
            {displayItems.length === 0 || displayItems.every((d) => d.overSla === 0) ? (
              <div className="flex flex-col h-full items-center justify-center text-xs text-muted-foreground italic">
                <span>Không có task nào vượt ngưỡng SLA tại các trạng thái</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayItems}
                  margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                >
                  <XAxis
                    dataKey="status"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    className="text-muted-foreground"
                    interval={0}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "currentColor", fontSize: 11 }}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs space-y-1">
                          <p className="font-semibold text-foreground">{d.status}</p>
                          <div className="text-muted-foreground space-y-0.5">
                            <p className="text-red-600 dark:text-red-400">
                              Vượt SLA: <span className="font-bold">{d.overSla}</span> task
                            </p>
                            <p>Tổng task ở bước này: <span className="font-semibold text-foreground">{d.taskCount}</span></p>
                            <p>Thời gian lưu trung bình: <span className="font-semibold text-foreground">{d.avgAge} ngày làm việc</span></p>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="overSla"
                    fill="oklch(0.6 0.22 25)"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
