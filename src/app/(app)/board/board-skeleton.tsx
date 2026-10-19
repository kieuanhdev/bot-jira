import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function BoardSkeleton({ columnCount }: { columnCount: number }) {
  const count = Math.max(3, Math.min(columnCount, 6));
  return (
    <div className="flex flex-1 gap-2.5 overflow-hidden">
      {Array.from({ length: count }, (_, g) => (
        <div key={g} className="flex min-w-64 flex-1 basis-72 flex-col">
          <div className="mb-2 flex items-center justify-between px-1">
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-5 w-8 rounded-md" />
          </div>
          <div className="flex flex-1 flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/60 p-2.5">
            {[0, 1, 2].map((row) => (
              <Card key={row} className="rounded-xl border-border/70 p-3 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-10 rounded" />
                </div>
                <Skeleton className="mt-2.5 h-4 w-full" />
                <Skeleton className="mt-1.5 h-4 w-2/3" />
                <div className="mt-2 flex items-center gap-1.5">
                  <Skeleton className="h-5 w-16 rounded-md" />
                  <Skeleton className="h-5 w-12 rounded-md" />
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3.5 w-20" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
