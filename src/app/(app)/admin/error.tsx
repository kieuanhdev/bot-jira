"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-base font-semibold">Đã xảy ra lỗi trong trang quản trị</h2>
      <p className="text-sm text-muted-foreground">
        Không thể tải dữ liệu quản trị. Vui lòng thử lại hoặc kiểm tra quyền truy cập.
      </p>
      <Button onClick={reset} className="cursor-pointer">
        Thử lại
      </Button>
    </div>
  );
}
