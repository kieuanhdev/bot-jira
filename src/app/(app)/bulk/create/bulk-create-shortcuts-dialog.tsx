"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Keyboard, CornerDownLeft, Copy, Plus, Table, Expand, X } from "lucide-react";

interface BulkCreateShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkCreateShortcutsDialog({
  open,
  onOpenChange,
}: BulkCreateShortcutsDialogProps) {
  const shortcuts = [
    {
      keys: ["Tab", "Shift + Tab"],
      description: "Di chuyển qua lại giữa các ô nhập liệu liên tiếp",
      icon: <Keyboard className="h-4 w-4 text-primary" aria-hidden="true" />,
    },
    {
      keys: ["Ctrl + Enter", "Cmd + Enter"],
      description: "Thêm ngay 1 dòng mới phía sau dòng đang đứng",
      icon: <Plus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />,
    },
    {
      keys: ["Ctrl + D", "Cmd + D"],
      description: "Nhân bản dòng hiện tại với đầy đủ các thuộc tính",
      icon: <Copy className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />,
    },
    {
      keys: ["Ctrl + V", "Cmd + V"],
      description: "Dán trực tiếp danh sách task hoặc bảng dữ liệu nhiều cột từ Excel / Google Sheets",
      icon: <Table className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
    },
    {
      keys: ["Shift + Space"],
      description: "Mở rộng / Thu gọn trình soạn thảo mô tả & thuộc tính nâng cao của dòng",
      icon: <Expand className="h-4 w-4 text-purple-600 dark:text-purple-400" aria-hidden="true" />,
    },
    {
      keys: ["Esc"],
      description: "Đóng cửa sổ phụ, thu gọn dòng mở rộng hoặc thoát chế độ chỉnh sửa ô",
      icon: <X className="h-4 w-4 text-muted-foreground" aria-hidden="true" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Keyboard className="h-5 w-5 text-primary" aria-hidden="true" />
            Phím tắt trình soạn thảo bảng tính
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Thao tác nhanh trên bàn phím giúp bạn nhập và xử lý hàng chục task mà không cần dùng chuột.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y divide-border/60 rounded-lg border border-border/80 bg-muted/20">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3">
              <div className="mt-0.5 shrink-0">{s.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {s.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="inline-flex items-center rounded border border-border bg-card px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground shadow-2xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
