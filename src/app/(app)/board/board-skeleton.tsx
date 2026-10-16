import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function BoardSkeleton({ columnCount }: { columnCount: number }) {
  const count = Math.max(3, Math.min(columnCount, 6));
  return (
    <div className="flex flex-1 gap-3 overflow-hidden">
      {Array.from({ length: count }, (_, g) => (
        <div key={g} className="flex min-w-64 flex-1 basis-64 flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-6" />
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((row) => (
              <Card key={row} className="p-2.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-24" />
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
