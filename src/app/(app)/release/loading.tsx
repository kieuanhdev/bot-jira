import { Skeleton } from "@/components/ui/skeleton";

export default function ReleaseLoading() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-4 w-80 max-w-full rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
      </div>

      {/* Summary KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-7 w-12 rounded" />
            <Skeleton className="h-3 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Toolbar / filter bar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-64 rounded-md" />
          <Skeleton className="h-9 w-48 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
      </div>

      {/* Release cards skeleton */}
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-32 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-40 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
