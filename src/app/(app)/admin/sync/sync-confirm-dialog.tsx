"use client";

import { PauseCircle, RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

export type PendingSyncAction =
  | { kind: "disable"; key: string }
  | { kind: "disable-all" }
  | { kind: "full"; key: string }
  | null;

export interface SyncConfirmDialogProps {
  pending: PendingSyncAction;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  enabledCount: number;
}

export function SyncConfirmDialog({
  pending,
  onOpenChange,
  onConfirm,
  isPending,
  enabledCount,
}: SyncConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={onOpenChange}
      icon={pending?.kind === "full" ? RefreshCw : PauseCircle}
      tone={pending?.kind === "full" ? "default" : "destructive"}
      pending={isPending}
      onConfirm={onConfirm}
      title={
        pending?.kind === "disable"
          ? `Tắt đồng bộ ${pending.key}?`
          : pending?.kind === "disable-all"
            ? `Tắt đồng bộ ${enabledCount} dự án?`
            : pending?.kind === "full"
              ? `Đồng bộ toàn bộ ${pending.key}?`
              : ""
      }
      description={
        pending?.kind === "full"
          ? "Quét lại toàn bộ issue của dự án từ Jira, bỏ qua mốc đồng bộ gần nhất. Có thể mất vài phút với dự án lớn."
          : "Không ai đồng bộ được dự án này cho đến khi bật lại: kể cả lịch tự động, nút đồng bộ trên board và webhook Jira. Dữ liệu hiện có được giữ nguyên và hiển thị kèm cảnh báo. Lượt đồng bộ đang chạy (nếu có) sẽ chạy nốt."
      }
      confirmLabel={pending?.kind === "full" ? "Đồng bộ toàn bộ" : "Tắt đồng bộ"}
    />
  );
}
