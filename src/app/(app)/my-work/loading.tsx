import { PageContainer } from "@/components/shared/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyWorkLoading() {
  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>

        {/* 4 KPI Cards Skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>

        {/* Tab Navigation Skeleton */}
        <div className="flex items-center gap-4 border-b border-border pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-28" />
          ))}
        </div>

        {/* Content Skeletons */}
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
