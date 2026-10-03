"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";
import type { ProjectFlowMetrics, MetricComparison } from "@/lib/reports/types";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface ThroughputFlowChartProps {
  flow: ProjectFlowMetrics;
  comparison?: MetricComparison | null;
  periodLabel: string;
}

export function ThroughputFlowChart({ flow, comparison, periodLabel }: ThroughputFlowChartProps) {
  const chartData = [
    {
      name: "Tạo mới trong kỳ",
      count: flow.createdInPeriod,
      previous: comparison?.created.previous ?? 0,
      fill: "var(--chart-2)",
    },
    {
      name: "Hoàn thành trong kỳ",
      count: flow.completedInPeriod,
      previous: comparison?.completed.previous ?? 0,
      fill: "var(--chart-1)",
    },
  ];

  return (
    <Card className="shadow-sm border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold">Luồng công việc trong kỳ</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tạo mới so với hoàn thành trong {periodLabel}.
          </p>
        </div>

        {/* Net Backlog badge */}
        <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md bg-muted">
          <span>Thay đổi tồn đọng:</span>
          {flow.netBacklogChange > 0 ? (
            <span className="text-amber-600 dark:text-amber-400 font-bold inline-flex items-center">
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              +{flow.netBacklogChange} việc
            </span>
          ) : flow.netBacklogChange < 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-bold inline-flex items-center">
              <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              {flow.netBacklogChange} việc
            </span>
          ) : (
            <span className="text-muted-foreground font-bold">Cân bằng (0)</span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[220px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="count" name="Kỳ hiện tại" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              {comparison && (
                <Bar dataKey="previous" name="Kỳ trước đó" fill="var(--muted-foreground)" opacity={0.4} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
