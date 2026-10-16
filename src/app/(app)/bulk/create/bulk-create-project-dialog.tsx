"use client";

import React from "react";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Xác nhận thay đổi dự án Jira
          </DialogTitle>
          <DialogDescription className="text-xs">
            Bảng soạn thảo hiện tại đang có dữ liệu task hoặc cài đặt mặc định.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
          Dự án sẽ chuyển sang <strong>{pendingProjectKey}</strong>. Các giá trị phụ thuộc vào dự án cũ (Loại task, Mức ưu tiên, Phiên bản) và các giá trị mặc định sẽ được đặt lại để tương thích. Tiêu đề và mô tả công việc sẽ được giữ nguyên an toàn.
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="cursor-pointer text-xs"
          >
            Huỷ bỏ
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
