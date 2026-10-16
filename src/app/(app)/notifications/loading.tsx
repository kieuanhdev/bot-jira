import { Skeleton } from "@/components/ui/skeleton";
import { MetricGrid } from "@/components/shared/metric-grid";

export default function NotificationsLoading() {
  return (
    <div className="container max-w-6xl mx-auto py-6 space-y-6 px-4">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </div>

      {/* Summary Metric Cards Skeleton */}
      <MetricGrid columns={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-xs"
          >
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-7 w-12" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        ))}
      </MetricGrid>

      {/* Filters Skeleton */}
      <div className="space-y-3 bg-card p-4 rounded-xl border border-border shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-64 rounded-lg shrink-0" />
        </div>
        <div className="pt-2 border-t border-border/50 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>

      {/* Notification List Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 rounded-xl border border-border p-4 bg-card items-start"
          >
            <Skeleton className="h-5 w-5 rounded mt-1 shrink-0" />
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3.5 w-20" />
              </div>
              <Skeleton className="h-3.5 w-full max-w-xl" />
              <div className="flex items-center gap-2 pt-1">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
