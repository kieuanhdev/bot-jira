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
import { ShieldAlert } from "lucide-react";
import type { BulkCreatePreviewResult } from "@/lib/bulk/create-types";

export interface CreatePreviewConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  preview: BulkCreatePreviewResult;
  onConfirm: () => void;
}

export function CreatePreviewConfirmDialog({
  open,
  onOpenChange,
  projectKey,
  preview,
  onConfirm,
}: CreatePreviewConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            Xác nhận tạo task trên Jira
          </DialogTitle>
          <DialogDescription className="text-xs">
            Vui lòng xem lại thông tin tóm tắt trước khi hệ thống đưa vào hàng đợi xử lý nền.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5 text-xs">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Dự án đích:</span>
            <span className="font-semibold text-foreground">{projectKey}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Số task sẽ tạo:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {preview.actionable} task
            </span>
          </div>
          {preview.blocked > 0 && (
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Số task bị chặn (bỏ qua):</span>
              <span className="font-semibold text-red-600 dark:text-red-400">
                {preview.blocked} task
              </span>
            </div>
          )}
          <div className="pt-1 text-[11px] text-muted-foreground leading-relaxed">
            ⚠️ <strong>Lưu ý:</strong> Task được tạo trực tiếp trên Jira dưới danh nghĩa tài khoản cá nhân của bạn. Không có tính năng tự động xoá/rollback sau khi task đã tạo thành công.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer text-xs"
          >
            Huỷ bỏ
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
            className="cursor-pointer gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
          >
            Tôi đồng ý, tạo ngay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
