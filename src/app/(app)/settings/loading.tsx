import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-6 p-6"
      aria-busy="true"
      aria-label="Đang tải cài đặt"
    >
      {/* Integrations Card Skeleton */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="mb-2 h-6 w-40" />
        <Skeleton className="mb-6 h-4 w-72" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>

      {/* Notifications Card Skeleton */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="mb-6 h-4 w-80" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>

      {/* Project Leaders Card Skeleton */}
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <Skeleton className="mb-2 h-6 w-36" />
        <Skeleton className="mb-6 h-4 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
