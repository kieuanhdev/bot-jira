"use client";

import React, { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { resolveDraftStatus } from "./lib/bulk-create-controller-model";

export interface BulkCreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingProjectKey: string | null;
  onConfirm: (key: string) => void;
  onCancel: () => void;
}

export function BulkCreateProjectDialog({
  open,
  onOpenChange,
  pendingProjectKey,
  onConfirm,
  onCancel,
}: BulkCreateProjectDialogProps) {
  const hasTargetDraft = useMemo(() => {
    if (!pendingProjectKey || typeof window === "undefined") return false;
    try {
      const raw = localStorage.getItem(`bulk-create-draft:${pendingProjectKey}`);
      return resolveDraftStatus(raw) === "pending-decision";
    } catch {
      return false;
    }
  }, [pendingProjectKey]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
            Xác nhận thay đổi dự án Jira
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bảng soạn thảo hiện tại đang có dữ liệu task hoặc cài đặt mặc định.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed space-y-2">
          <div>
            Chuyển sang <strong>{pendingProjectKey}</strong>.
          </div>
          <ul className="list-disc pl-4 space-y-1 text-[11px]">
            <li>
              <strong>Giữ lại:</strong> tiêu đề, mô tả, người thực hiện, ước lượng, hạn, điểm, nhãn.
            </li>
            <li>
              <strong>Đặt lại:</strong> loại task, mức ưu tiên, phiên bản và các giá trị mặc định (vì khác nhau giữa các dự án).
            </li>
          </ul>
          {hasTargetDraft && (
            <p className="text-primary font-medium text-[11px] pt-1.5 border-t border-border/60">
              Dự án {pendingProjectKey} có bản nháp đã lưu, bạn sẽ được hỏi khôi phục sau khi chuyển.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="cursor-pointer text-xs"
          >
            Huỷ
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              if (pendingProjectKey) {
                onConfirm(pendingProjectKey);
              }
            }}
            className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
          >
            Đồng ý chuyển dự án
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
