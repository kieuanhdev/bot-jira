import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Header & Controls Skeleton */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-40 rounded" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-48 rounded" />
              <Skeleton className="h-5 w-14 rounded" />
            </div>
            <Skeleton className="h-3 w-56 rounded" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Tabs Bar Skeleton */}
      <div className="border-b border-border pb-2 flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>

      {/* Health Banner Skeleton */}
      <Skeleton className="h-28 w-full rounded-xl" />

      {/* KPIs Grid Skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>

      {/* Main Charts Skeleton */}
      <Skeleton className="h-[400px] w-full rounded-xl" />

      {/* Secondary Charts Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-[280px] w-full rounded-xl" />
        <Skeleton className="h-[280px] w-full rounded-xl" />
      </div>
    </div>
  );
}
