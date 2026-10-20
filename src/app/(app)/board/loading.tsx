import { BoardSkeleton } from "./board-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <BoardSkeleton columnCount={5} />
    </div>
  );
}
