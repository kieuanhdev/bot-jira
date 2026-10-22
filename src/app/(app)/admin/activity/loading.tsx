import { Skeleton } from "@/components/ui/skeleton";
import { MetricGrid } from "@/components/shared/metric-grid";

export default function AdminActivityLoading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* 4 Metric Cards */}
      <MetricGrid columns={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card shadow-xs h-28"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </MetricGrid>

      {/* Filter Toolbar Skeleton */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>

      {/* Activity Table Skeleton */}
      <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
        <div className="p-3 bg-muted/40">
          <Skeleton className="h-4 w-full" />
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3.5 gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-64 flex-1" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
