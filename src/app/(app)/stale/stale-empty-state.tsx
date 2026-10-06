import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { RotateCcw, Search } from "lucide-react";
import { GreenCheck } from "./stale-task-meta";

export function StaleEmptyState({
  filtered,
  onClear,
  title,
  hint,
}: {
  filtered: boolean;
  onClear?: () => void;
  title?: string;
  hint?: string;
}) {
  return (
    <EmptyState
      icon={filtered ? Search : GreenCheck}
      title={title ?? (filtered ? "Không có task phù hợp với lăng kính này" : "Luồng công việc đang trong giới hạn")}
      hint={hint ?? (filtered ? "Thử đổi phạm vi, từ khóa hoặc xóa bộ lọc để xem toàn bộ task vượt SLA." : "Không có task hoạt động nào vượt SLA theo trạng thái trong phạm vi hiện tại.")}
      action={
        filtered && onClear ? (
          <Button className="cursor-pointer" variant="outline" size="sm" onClick={onClear}>
            <RotateCcw aria-hidden className="h-3.5 w-3.5 mr-1.5" /> Xóa bộ lọc
          </Button>
        ) : undefined
      }
    />
  );
}
