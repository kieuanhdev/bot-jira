"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { PortfolioSummary } from "./portfolio-summary";
import { ProjectReportTable } from "./project-report-table";
import { ReportPeriodFilter } from "../report-period-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, AlertCircle, RefreshCw, Clock, Globe } from "lucide-react";
import type { ProjectPortfolioResponse, ReportUnit, ReportPeriod } from "@/lib/reports/types";
import { resolveReportPeriod } from "@/lib/reports/period";

export function ProjectPortfolioClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialPeriod = useMemo(() => {
    return resolveReportPeriod({
      period: searchParams.get("period") || "this_week",
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      timezone: searchParams.get("timezone") || "Asia/Ho_Chi_Minh",
    }).period;
  }, [searchParams]);

  const [period, setPeriod] = useState<ReportPeriod>(initialPeriod);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<string | null>(
    searchParams.get("health") || null
  );
  const [unit, setUnit] = useState<ReportUnit>(
    (searchParams.get("unit") as ReportUnit) || "auto"
  );

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (period.preset !== "this_week") params.set("period", period.preset);
    if (period.preset === "custom") {
      params.set("from", period.from);
      params.set("to", period.to);
    }
    if (healthFilter) params.set("health", healthFilter);
    if (unit !== "auto") params.set("unit", unit);

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [period, healthFilter, unit, pathname, router]);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {
      period: period.preset,
      from: period.from,
      to: period.to,
      timezone: period.timezone,
    };
    if (healthFilter) params.health = healthFilter;
    if (unit !== "auto") params.unit = unit;
    return params;
  }, [period, healthFilter, unit]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ProjectPortfolioResponse>({
    queryKey: reportsKeys.portfolio(queryParams),
    queryFn: () => {
      const sp = new URLSearchParams(queryParams);
      const qs = sp.toString();
      return api<ProjectPortfolioResponse>(`/api/reports/projects${qs ? `?${qs}` : ""}`);
    },
    staleTime: 60_000,
  });

  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];
    if (!search.trim()) return data.projects;
    const q = search.toLowerCase().trim();
    return data.projects.filter(
      (p) =>
        p.projectKey.toLowerCase().includes(q) ||
        p.projectName.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Báo cáo danh mục dự án
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>Báo cáo theo tuần/tháng và toàn bộ luồng công việc của dự án.</span>
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" aria-hidden="true" />
              {period.timezone}
            </span>
            {data?.freshness?.lastSyncedAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                Đồng bộ Jira: {new Date(data.freshness.lastSyncedAt).toLocaleTimeString("vi-VN")}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <ReportPeriodFilter period={period} onPeriodChange={setPeriod} />

          {/* Unit selector */}
          <div className="w-[130px]">
            <Select value={unit} onValueChange={(v) => setUnit(v as ReportUnit)}>
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <SelectValue placeholder="Đơn vị tính" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Tự động (Auto)</SelectItem>
                <SelectItem value="tasks">Số lượng Task</SelectItem>
                <SelectItem value="points">Story Points</SelectItem>
                <SelectItem value="estimate">Estimate (Giờ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      )}

      {/* Error state */}
      {isError && (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-destructive/20 bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive mb-2" aria-hidden="true" />
          <h3 className="text-base font-semibold text-destructive">
            Không thể tải dữ liệu báo cáo
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            {(error as Error)?.message || "Đã xảy ra lỗi khi kết nối tới máy chủ."}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition-opacity cursor-pointer"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Success data content */}
      {data && (
        <>
          {/* Summary Cards */}
          <PortfolioSummary
            summary={data.summary}
            selectedHealth={healthFilter}
            onFilterHealth={(h) => setHealthFilter(h)}
          />

          {/* Search bar and count */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm dự án theo tên hoặc mã..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>

            <div className="text-xs text-muted-foreground">
              Hiển thị <span className="font-semibold text-foreground">{filteredProjects.length}</span> / {data.projects.length} dự án
              {healthFilter && (
                <button
                  type="button"
                  onClick={() => setHealthFilter(null)}
                  className="ml-2 text-primary hover:underline cursor-pointer"
                >
                  (Xóa bộ lọc sức khỏe)
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <ProjectReportTable projects={filteredProjects} period={period} unit={unit} />
        </>
      )}
    </div>
  );
}
