import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationFooterProps {
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  totalItems?: number;
  itemLabel?: string;
  disabled?: boolean;
  className?: string;
  hideOnSinglePage?: boolean;
}

export function PaginationFooter({
  page,
  totalPages,
  onPageChange,
  totalItems,
  itemLabel = "mục",
  disabled = false,
  className,
  hideOnSinglePage = true,
}: PaginationFooterProps) {
  if (hideOnSinglePage && totalPages <= 1) {
    return null;
  }

  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div
      className={cn(
        "flex items-center justify-between text-xs text-muted-foreground pt-3",
        className
      )}
    >
      <div>
        <span>
          Trang <strong className="text-foreground">{page}</strong> / {totalPages}
        </span>
        {typeof totalItems === "number" && (
          <span className="ml-1.5">
            ({totalItems.toLocaleString("vi-VN")} {itemLabel})
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs cursor-pointer disabled:cursor-not-allowed gap-1"
          disabled={disabled || isFirst}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Trước</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-2.5 text-xs cursor-pointer disabled:cursor-not-allowed gap-1"
          disabled={disabled || isLast}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
        >
          <span>Sau</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
