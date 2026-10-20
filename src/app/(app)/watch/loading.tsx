import { GridSkeleton } from "@/components/shared/skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function WatchLoading() {
  return (
      <div className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <GridSkeleton count={4} />
      </div>
  );
}
