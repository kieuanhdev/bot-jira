import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCheck, Edit3, Eye, ListPlus, Loader2, Sparkles } from "lucide-react";
import type { OperationKind } from "./lib/bulk-logic";

export function BulkTopNav() {
  return (
    <div className="flex border-b border-border">
      <Link
        href="/bulk"
        className="flex items-center gap-2 border-b-2 border-primary px-4 py-2.5 text-xs font-semibold text-primary cursor-pointer transition-colors"
      >
        <Edit3 className="h-4 w-4" aria-hidden="true" />
        Cập nhật task hàng loạt
      </Link>
      <Link
        href="/bulk/create"
        className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
      >
        <ListPlus className="h-4 w-4" aria-hidden="true" />
        Tạo task mới hàng loạt
      </Link>
    </div>
  );
}

export function BulkProgressSteps({
  filterProject,
  effectiveCount,
  operationKind,
  actionReady,
  hasPreview,
}: {
  filterProject: string;
  effectiveCount: number;
  operationKind: OperationKind;
  actionReady: boolean;
  hasPreview: boolean;
}) {
  return (
    <ol aria-label="Tiến trình thao tác hàng loạt" className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card">
      {[
        { number: 1, label: "Chọn dự án & task", active: true, done: Boolean(filterProject) && effectiveCount > 0 },
        {
          number: 2,
          label:
            operationKind === "transition"
              ? "Chọn trạng thái đích"
              : operationKind === "log-work"
                ? "Thiết lập Worklog"
                : "Chọn trường cần sửa",
          active: Boolean(filterProject) && effectiveCount > 0,
          done: actionReady,
        },
        { number: 3, label: "Xem trước & Chạy", active: hasPreview, done: false },
      ].map((step) => (
        <li
          key={step.number}
          className={cn(
            "flex min-w-0 items-center gap-2 border-r px-3 py-3 text-xs last:border-r-0 sm:px-4 sm:text-sm",
            step.active && "bg-primary/5",
            !step.active && "text-muted-foreground"
          )}
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              step.done
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : step.active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted"
            )}
          >
            {step.done ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : step.number}
          </span>
          <span className="truncate font-medium">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Shown when the page was opened from the standardization list with pre-selected tasks. */
export function StandardizationBanner({ count }: { count: number }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs text-primary shadow-xs">
      <div className="flex items-center gap-2.5">
        <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-semibold text-foreground">
            Đang chuẩn hóa {count} task từ danh sách chuẩn hóa
          </p>
          <p className="text-muted-foreground mt-0.5">
            Các task này đã được chọn sẵn và đưa lên đầu danh sách để bạn dễ quan sát và thực hiện thao tác.
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5 shrink-0 self-start sm:self-auto text-xs bg-background">
        <Link href="/stale?view=my-work&tab=standardization">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Quay lại chuẩn hóa
        </Link>
      </Button>
    </div>
  );
}

/** Sticky bar so the primary action stays reachable while scrolling a long task list. */
export function BulkActionBar({
  filterProject,
  count,
  disabled,
  previewing,
  label,
  onPreview,
}: {
  filterProject: string;
  count: number;
  disabled: boolean;
  previewing: boolean;
  label: string;
  onPreview: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-1 flex items-center justify-between gap-3 rounded-lg border bg-background/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <p className="min-w-0 truncate text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{count}</span> task
        {filterProject ? <> · <span className="font-mono">{filterProject}</span></> : null}
      </p>
      <Button onClick={onPreview} disabled={disabled} className="shrink-0 cursor-pointer">
        {previewing ? (
          <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
        {label}
      </Button>
    </div>
  );
}
