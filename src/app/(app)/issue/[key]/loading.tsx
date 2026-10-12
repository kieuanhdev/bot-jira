import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="Đang tải">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-9 w-2/3" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-96 md:col-span-2" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}
