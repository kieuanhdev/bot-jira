import { Skeleton } from "@/components/ui/skeleton";

export default function LeaderboardLoading() {
  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Personal cultivation banner */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 rounded" />
              <Skeleton className="h-4 w-32 rounded" />
            </div>
          </div>
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-48 rounded-md" />
        </div>
      </div>

      {/* Podium Top 3 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-6">
        <div className="flex flex-col items-center justify-end rounded-xl border border-border bg-card p-6 space-y-3 h-64">
          <Skeleton className="h-16 w-16 rounded-full" />
          <Skeleton className="h-5 w-28 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="flex flex-col items-center justify-end rounded-xl border border-border bg-card p-6 space-y-3 h-72">
          <Skeleton className="h-20 w-20 rounded-full" />
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
        </div>
        <div className="flex flex-col items-center justify-end rounded-xl border border-border bg-card p-6 space-y-3 h-60">
          <Skeleton className="h-14 w-14 rounded-full" />
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border p-4">
          <Skeleton className="h-5 w-40 rounded" />
        </div>
        <div className="divide-y divide-border">
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <div key={row} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-4 w-16 rounded" />
                <Skeleton className="h-4 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
