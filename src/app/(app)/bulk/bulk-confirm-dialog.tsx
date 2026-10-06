import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { formatJiraDuration, parseJiraDuration } from "@/lib/worklogs/schema";
import { CheckCheck, Clock } from "lucide-react";
import type { Preview } from "./lib/bulk-types";

export function BulkConfirmDialog({
  open,
  onOpenChange,
  isLogWorkOp,
  worklogDuration,
  preview,
  filterProject,
  confirmLabel,
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isLogWorkOp: boolean;
  worklogDuration: string;
  preview: Preview | null;
  filterProject: string;
  confirmLabel: string;
  confirming: boolean;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-lg"
      icon={isLogWorkOp ? Clock : CheckCheck}
      title={isLogWorkOp ? "Xác nhận ghi Worklog hàng loạt" : "Xác nhận cập nhật nhiều trường"}
      description={
        isLogWorkOp
          ? `Bạn sắp ghi ${worklogDuration} cho mỗi task. Tổng cộng ${formatJiraDuration(
              (preview?.actionable ?? 0) * (parseJiraDuration(worklogDuration) ?? 0)
            )} sẽ được ghi lên ${preview?.actionable ?? 0} task thuộc dự án ${filterProject}.`
          : `Bạn sắp cập nhật các trường đã chọn cho ${preview?.actionable ?? 0} task thuộc dự án ${filterProject}.`
      }
      onConfirm={onConfirm}
      confirmLabel={confirmLabel}
      cancelLabel="Quay lại"
      pending={confirming}
      disabled={(preview?.actionable ?? 0) === 0}
    >
      <div className="rounded-md border bg-muted/40 p-3 text-sm">
        <p className="font-medium">Lưu ý trước khi thực thi</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {isLogWorkOp ? (
            <>
              <li>Mỗi task sẽ được tạo một worklog mới với danh tính Jira của bạn.</li>
              <li>Remaining Estimate sẽ được giữ nguyên (adjustEstimate = leave).</li>
              <li>Nếu một task gặp lỗi, các task còn lại vẫn tiếp tục được thực hiện.</li>
              <li>Dữ liệu chuẩn hóa và thời gian đã ghi sẽ tự động được làm mới khi hoàn tất.</li>
            </>
          ) : (
            <>
              <li>Hệ thống sẽ cập nhật từng task trên Jira và cập nhật lại cache.</li>
              <li>Nếu một task gặp lỗi, các task còn lại vẫn tiếp tục được thực hiện.</li>
              <li>Bạn có thể theo dõi tiến trình trực tiếp bên dưới.</li>
            </>
          )}
        </ul>
      </div>
    </ConfirmDialog>
  );
}
