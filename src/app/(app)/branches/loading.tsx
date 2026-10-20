import { Skeleton } from "@/components/ui/skeleton";

export default function BranchesLoading() {
  return (
      <div className="flex flex-col gap-6">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1.5">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
        </div>

        {/* Toolbar Skeleton */}
        <div className="space-y-3 bg-card p-4 rounded-xl border border-border shadow-xs">
          {/* View Mode Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-28 rounded-lg shrink-0" />
            ))}
          </div>

          {/* Search + Filter Selects */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center pt-2 border-t border-border/50">
            <Skeleton className="h-9 flex-1 rounded-lg" />
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>

        {/* List / Table Rows Skeleton */}
        <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between p-4 gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Skeleton className="h-5 w-5 rounded mt-0.5 shrink-0" />
                <div className="space-y-2 flex-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-20 rounded" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <Skeleton className="h-3.5 w-64" />
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>
  );
}
