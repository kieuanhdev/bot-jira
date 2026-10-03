"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
  const queryParams = new URLSearchParams({
    period: period.preset,
    from: period.from,
    to: period.to,
    timezone: period.timezone,
  });
  if (versionId && versionId !== "all") queryParams.set("versionId", versionId);

  const { data, isLoading, isError } = useQuery<ProjectHistoryResponse>({
    queryKey: ["reports", "history", projectKey, queryParams.toString()],
    queryFn: () => api<ProjectHistoryResponse>(`/api/reports/projects/${projectKey}/history?${queryParams.toString()}`),
    staleTime: 60_000,
  });

  const points = data?.dataPoints || [];

  return (
    <div className="space-y-6">
      {/* Notice */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
        <p>
          <strong>Dữ liệu xu hướng:</strong> Biểu đồ thể hiện thông lượng hoàn thành và biến động tồn đọng theo từng ngày/tuần trong kỳ báo cáo. Dữ liệu lịch sử dài hạn được tổng hợp tự động từ sự kiện Jira và snapshot hằng ngày.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-[280px] w-full rounded-xl" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="p-8 text-center text-sm text-destructive border rounded-xl bg-destructive/10">
          Không thể tải dữ liệu xu hướng. Vui lòng thử lại sau.
        </div>
      ) : points.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed border-border bg-card">
          <TrendingUp className="h-8 w-8 text-muted-foreground mb-2" />
          <h4 className="text-sm font-semibold">Chưa có dữ liệu xu hướng trong kỳ</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Không có hoạt động tạo mới hoặc hoàn thành nào trong khoảng thời gian đã chọn.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Chart 1: Throughput Timeline */}
          <Card className="shadow-sm border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">
                Xu hướng thông lượng hoàn thành (Throughput)
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Số lượng task hoàn thành theo từng mốc thời gian trong {period.preset}.
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
