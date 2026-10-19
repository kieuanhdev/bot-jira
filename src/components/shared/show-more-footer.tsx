import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ShowMoreFooterProps {
  visibleCount: number;
  totalCount: number;
  onShowMore: () => void;
  step?: number;
  unit?: string;
  className?: string;
}

export function ShowMoreFooter({
  visibleCount,
  totalCount,
  onShowMore,
  step = 50,
  unit = "task",
  className,
}: ShowMoreFooterProps) {
  if (visibleCount >= totalCount) return null;

  const shown = Math.min(visibleCount, totalCount);
  const remaining = totalCount - shown;
  const nextIncrement = Math.min(step, remaining);

  return (
    <div className={cn("flex flex-col items-center gap-2 border-t px-6 py-4", className)}>
      <p className="text-sm text-muted-foreground">
        Đang hiển thị {shown} trên {totalCount} {unit}
      </p>
      <Button
        className="cursor-pointer"
        variant="outline"
        size="sm"
        onClick={onShowMore}
      >
        Xem thêm {nextIncrement} {unit}
      </Button>
    </div>
  );
}
