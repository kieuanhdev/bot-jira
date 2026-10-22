"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { agileAnalyticsKeys } from "@/lib/query-keys";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { TrendingDown } from "lucide-react";
import type { BurndownResponse } from "@/lib/reports/agile-analytics";

interface BurndownChartProps {
  projectKey: string;
  releaseId?: string;
  className?: string;
}

export function BurndownChart({ projectKey, releaseId, className }: BurndownChartProps) {
  const { data, isLoading } = useQuery<BurndownResponse>({
    queryKey: agileAnalyticsKeys.burndown(projectKey, releaseId),
    queryFn: () => {
      const sp = new URLSearchParams({ projectKey });
      if (releaseId) sp.set("releaseId", releaseId);
      return api<BurndownResponse>(`/api/analytics/burndown?${sp.toString()}`);
    },
  });

  if (isLoading) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data?.release || data.points.length === 0) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardContent className="pt-6">
          <EmptyState
            icon={TrendingDown}
            title="Chưa có dữ liệu Burndown"
            hint="Dự án chưa có Release hoặc Sprint nào đang hoạt động có gắn nhiệm vụ."
          />
        </CardContent>
      </Card>
    );
  }

  const { release, points } = data;
  const currentActual = points.filter((p) => p.actual !== null).pop()?.actual ?? release.remainingPoints;
  const currentIdeal = points.filter((p) => p.actual !== null).pop()?.ideal ?? 0;
  const isOnTrack = currentActual <= currentIdeal + 2;

  return (
    <Card className={`border-border shadow-xs ${className ?? ""}`}>
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold">
                Sprint/Release Burndown Chart
              </CardTitle>
              <Badge variant="outline" className="text-2xs font-mono">
                {release.version}
              </Badge>
              <Badge variant={isOnTrack ? "success" : "warning"} className="text-2xs">
                {isOnTrack ? "Đúng tiến độ (On Track)" : "Có nguy cơ trễ hạn"}
              </Badge>
            </div>
            <p className="text-2xs text-muted-foreground">
              Đường lý tưởng (Ideal Line) so với tiến độ thực tế (Actual Line) theo điểm Story Points.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="text-right">
              <span className="text-2xs text-muted-foreground block">Tổng điểm</span>
              <span className="text-foreground font-semibold">{release.totalPoints} pts</span>
            </div>
            <div className="text-right">
              <span className="text-2xs text-muted-foreground block">Còn lại</span>
              <span className="text-primary font-bold">{release.remainingPoints} pts</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
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
              <Line
                type="monotone"
                dataKey="ideal"
                name="Tiến độ lý tưởng (Ideal)"
                stroke="#94A3B8"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="actual"
                name="Thực tế còn lại (Actual)"
                stroke="#0D9488"
                strokeWidth={3}
                dot={{ r: 3, fill: "#0D9488" }}
                activeDot={{ r: 5 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
