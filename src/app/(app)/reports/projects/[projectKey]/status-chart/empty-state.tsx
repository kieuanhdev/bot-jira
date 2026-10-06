import { PieChart as PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StatusChartEmptyState({
  activeHiddenCount,
  onShowAll,
}: {
  activeHiddenCount: number;
  onShowAll: () => void;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <PieChartIcon
          className="h-6 w-6 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm font-semibold text-foreground">
        Không có task hiển thị trong phạm vi đã chọn
      </p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        {activeHiddenCount > 0
          ? "Bạn đang ẩn một số trạng thái trong tùy biến hiển thị."
          : "Dữ liệu phân bố theo trạng thái sẽ xuất hiện sau khi đồng bộ các issue từ Jira."}
      </p>
      {activeHiddenCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={onShowAll}
          className="mt-3 text-xs"
        >
          Hiện lại tất cả trạng thái
        </Button>
      )}
    </div>
  );
}
