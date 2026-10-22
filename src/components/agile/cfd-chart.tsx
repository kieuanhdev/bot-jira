"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { agileAnalyticsKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { Layers, AlertTriangle } from "lucide-react";
import type { CFDPoint } from "@/lib/reports/agile-analytics";

interface CFDChartProps {
  projectKey: string;
  days?: number;
  className?: string;
}

export function CFDChart({ projectKey, days = 30, className }: CFDChartProps) {
  const { data: points, isLoading } = useQuery<CFDPoint[]>({
    queryKey: agileAnalyticsKeys.cfd(projectKey, days),
    queryFn: () => api<CFDPoint[]>(`/api/analytics/cfd?projectKey=${projectKey}&days=${days}`),
  });

  if (isLoading) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-52" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!points || points.length === 0) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardContent className="pt-6">
          <EmptyState
            icon={Layers}
            title="Chưa đủ dữ liệu CFD"
            hint="Cumulative Flow Diagram cần dữ liệu task theo thời gian để vẽ dòng chảy trạng thái."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`border-border shadow-xs ${className ?? ""}`}>
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold">
                Cumulative Flow Diagram (CFD)
              </CardTitle>
            </div>
            <p className="text-2xs text-muted-foreground">
              Phát hiện nút thắt cổ chai (Bottlenecks) và kiểm soát lượng việc đang làm dở (WIP - Work in Progress).
            </p>
          </div>
          <span className="text-2xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
            Chu kỳ {days} ngày gần nhất
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="label"
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
                wrapperStyle={{ fontSize: "11px", paddingBottom: "10px" }}
              />

              {/* Stacked Areas */}
              <Area
                type="monotone"
                dataKey="toDo"
                name="To Do"
                stroke="#64748B"
                fill="#64748B"
                fillOpacity={0.25}
              />
              <Area
                type="monotone"
                dataKey="inProgress"
                name="In Progress"
                stroke="#0D9488"
                fill="#0D9488"
                fillOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="testing"
                name="Testing / Review"
                stroke="#8B5CF6"
                fill="#8B5CF6"
                fillOpacity={0.45}
              />
              <Area
                type="monotone"
                dataKey="done"
                name="Done"
                stroke="#10B981"
                fill="#10B981"
                fillOpacity={0.65}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Insight note */}
        <div className="flex items-start gap-2 p-3 bg-muted/40 rounded-lg border border-border text-2xs text-muted-foreground">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>Mẹo đọc CFD:</strong> Khi khoảng cách giữa dải <em>In Progress</em> và <em>Done</em> nở rộng bất thường, nghĩa là có quá nhiều task đang làm dở mà chưa được bàn giao hoàn thành (nguy cơ tắc nghẽn luồng kiểm thử hoặc review).
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
