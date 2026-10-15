"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AuthError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <h2 className="text-base font-semibold">Đã xảy ra lỗi xác thực</h2>
          <p className="text-sm text-muted-foreground">
            Không thể tải trang xác thực. Vui lòng thử lại.
          </p>
          <Button onClick={reset} className="cursor-pointer">
            Thử lại
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
