import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export type ListSkeletonProps = {
  rows?: number;
  className?: string;
};

/**
 * Simple loading placeholder for a vertical list / table: a bordered card with
 * `rows` horizontal skeletons. Domain-specific skeleton anatomy should stay in the
 * domain; this is the generic base.
 *
 * Presentational and server-compatible.
 */
export function ListSkeleton({ rows = 5, className }: ListSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-lg border border-border bg-card p-4", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export type GridSkeletonProps = {
  count?: number;
  className?: string;
};

/**
 * Simple loading placeholder for a responsive card grid: `count` card-shaped
 * skeletons in a 1-col → 2-col layout.
 *
 * Presentational and server-compatible.
 */
export function GridSkeleton({ count = 4, className }: GridSkeletonProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 md:grid-cols-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-3 h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
