import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata = {
  title: "Không tìm thấy | Team Task",
  description: "Trang hoặc tài nguyên bạn tìm kiếm không tồn tại.",
};

/**
 * 404 Not Found page rendered within the App shell (layout).
 * Triggered by `notFound()` in route segments (e.g. /issue/[key]) or unmatched subroutes.
 */
export default function AppNotFound() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center p-6 animate-in fade-in-50 duration-200">
      <EmptyState
        icon={FileQuestion}
        title="Không tìm thấy nội dung"
        hint="Trang hoặc tài nguyên bạn đang tìm kiếm không tồn tại, đã bị xóa hoặc bạn chưa được cấp quyền truy cập."
        action={
          <Button asChild size="sm" className="cursor-pointer gap-1.5 mt-2">
            <Link href="/board">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Quay lại Board
            </Link>
          </Button>
        }
        className="max-w-md border-border/80 bg-card p-8 shadow-xs"
      />
    </div>
  );
}
