"use client";

import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, Info } from "lucide-react";
import type { ProjectHistoryResponse, ReportPeriod } from "@/lib/reports/types";

interface TrendsTabProps {
  projectKey: string;
  period: ReportPeriod;
  versionId?: string | null;
}

export function TrendsTab({ projectKey, period, versionId }: TrendsTabProps) {
  const isVersionScope = Boolean(versionId && versionId !== "all");
  const historyParams = useMemo(() => {
    const params: Record<string, string> = { timezone: period.timezone };
    if (!isVersionScope) {
      params.period = period.preset;
      params.from = period.from;
      params.to = period.to;
    }
    if (versionId && versionId !== "all") params.versionId = versionId;
    return params;
  }, [period, isVersionScope, versionId]);

  const { data, isLoading, isError, refetch } = useQuery<ProjectHistoryResponse>({
    queryKey: reportsKeys.history(projectKey, historyParams),
    queryFn: () => {
      const sp = new URLSearchParams(historyParams);
      return api<ProjectHistoryResponse>(`/api/reports/projects/${projectKey}/history?${sp.toString()}`);
    },
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.history.staleTime,
    gcTime: queryPolicy.reports.history.gcTime,
  });


  const points = data?.dataPoints || [];

  return (
    <div className="space-y-6">
      {/* Notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
        <p>
          <strong>Dữ liệu xu hướng:</strong> Biểu đồ thể hiện thông lượng hoàn thành và biến động tồn đọng theo từng ngày/tuần {isVersionScope ? "trong toàn bộ vòng đời version" : "trong kỳ báo cáo"}. Dữ liệu lịch sử dài hạn được tổng hợp tự động từ sự kiện Jira và snapshot hằng ngày.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-[280px] w-full rounded-xl" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <ErrorState
          title="Không thể tải dữ liệu xu hướng"
          message="Vui lòng thử lại sau."
          onRetry={() => refetch()}
        />
      ) : points.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={isVersionScope ? "Chưa có dữ liệu xu hướng của version" : "Chưa có dữ liệu xu hướng trong kỳ"}
          hint="Không có hoạt động tạo mới hoặc hoàn thành nào trong khoảng thời gian đã chọn."
          className="bg-card"
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Chart 1: Throughput Timeline */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Xu hướng thông lượng hoàn thành (Throughput)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Số lượng task hoàn thành theo từng mốc thời gian
                {isVersionScope ? " của toàn bộ version." : ` trong ${period.preset}.`}
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val) => {
                        const parts = val.split("-");
                        return `${parts[2]}/${parts[1]}`;
                      }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
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
                    <Line
                      type="monotone"
                      dataKey="completedCount"
                      name="Task hoàn thành"
                      stroke="var(--chart-1)"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Chart 2: Backlog Created vs Completed */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Biến động tồn đọng: Tạo mới vs Hoàn thành
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                So sánh số lượng phát sinh mới và số lượng giải quyết được theo thời gian.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={points} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(val) => {
                        const parts = val.split("-");
                        return `${parts[2]}/${parts[1]}`;
                      }}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
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
                    <Bar
                      dataKey="createdCount"
                      name="Tạo mới"
                      fill="var(--chart-2)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="completedCount"
                      name="Hoàn thành"
                      fill="var(--chart-1)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
