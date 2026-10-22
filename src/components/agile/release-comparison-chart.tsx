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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { GitCompare, Calendar } from "lucide-react";
import type { ReleaseComparisonItem } from "@/lib/reports/agile-analytics";

interface ReleaseComparisonChartProps {
  projectKey: string;
  className?: string;
}

export function ReleaseComparisonChart({ projectKey, className }: ReleaseComparisonChartProps) {
  const { data: releases, isLoading } = useQuery<ReleaseComparisonItem[]>({
    queryKey: agileAnalyticsKeys.releases(projectKey),
    queryFn: () => api<ReleaseComparisonItem[]>(`/api/analytics/releases?projectKey=${projectKey}`),
  });

  if (isLoading) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-52" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!releases || releases.length === 0) {
    return (
      <Card className={`border-border ${className ?? ""}`}>
        <CardContent className="pt-6">
          <EmptyState
            icon={GitCompare}
            title="Chưa có dữ liệu so sánh Release"
            hint="Dự án chưa tạo hoặc đồng bộ các đợt phát hành Release từ Jira."
          />
        </CardContent>
      </Card>
    );
  }

  const chartData = [...releases].reverse().map((r) => ({
    version: r.version,
    "Tỷ lệ hoàn thành (%)": r.completionRate,
    "Điểm hoàn thành": r.completedPoints,
    "Tổng điểm scope": r.totalPoints,
  }));

  return (
    <Card className={`border-border shadow-xs ${className ?? ""}`}>
      <CardHeader className="pb-3 border-b border-border/60">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GitCompare className="w-4 h-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold">
                So sánh hiệu suất giữa các Release / Sprint
              </CardTitle>
            </div>
            <p className="text-2xs text-muted-foreground">
              Đối chiếu quy mô scope và tỷ lệ hoàn thành qua các đợt phát hành gần đây.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-6">
        {/* Comparison Bar Chart */}
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
              <XAxis
                dataKey="version"
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
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
              />
              <Bar dataKey="Tổng điểm scope" fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Điểm hoàn thành" fill="#0D9488" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Release Table breakdown */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">Bảng tổng hợp chi tiết</h4>
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-2.5 font-medium">Phiên bản</th>
                  <th className="p-2.5 font-medium">Trạng thái</th>
                  <th className="p-2.5 font-medium">Tiến độ công việc</th>
                  <th className="p-2.5 font-medium">Points</th>
                  <th className="p-2.5 font-medium">Ngày phát hành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {releases.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-2.5 font-semibold text-foreground">{r.version}</td>
                    <td className="p-2.5">
                      <Badge
                        variant={
                          r.status === "released"
                            ? "success"
                            : r.status === "ready"
                            ? "primary-soft"
                            : "neutral"
                        }
                        className="text-2xs"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-primary h-1.5 rounded-full"
                            style={{ width: `${r.completionRate}%` }}
                          />
                        </div>
                        <span className="font-medium text-foreground">
                          {r.doneTasks}/{r.totalTasks} ({r.completionRate}%)
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-muted-foreground">
                      <span className="font-semibold text-foreground">{r.completedPoints}</span>/{r.totalPoints} pts
                    </td>
                    <td className="p-2.5 text-muted-foreground">
                      {r.releaseDate ? (
                        <span className="flex items-center gap-1 text-2xs">
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {new Date(r.releaseDate).toLocaleDateString("vi-VN")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
