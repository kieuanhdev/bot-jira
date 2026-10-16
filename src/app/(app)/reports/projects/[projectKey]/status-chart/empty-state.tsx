import { PieChart as PieChartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export function StatusChartEmptyState({
  activeHiddenCount,
  onShowAll,
}: {
  activeHiddenCount: number;
  onShowAll: () => void;
}) {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <EmptyState
        icon={PieChartIcon}
        title="Không có task hiển thị trong phạm vi đã chọn"
        hint={
          activeHiddenCount > 0
            ? "Bạn đang ẩn một số trạng thái trong tùy biến hiển thị."
            : "Dữ liệu phân bố theo trạng thái sẽ xuất hiện sau khi đồng bộ các issue từ Jira."
        }
        action={
          activeHiddenCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onShowAll}
              className="mt-2 cursor-pointer text-xs"
            >
              Hiện lại tất cả trạng thái
            </Button>
          ) : null
        }
        className="border-0 bg-transparent py-6"
      />
    </div>
  );
}
