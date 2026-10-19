import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import { ACTION_LABELS, type OpListItem } from "./lib/bulk-types";
import { formatTime, isTerminalOpState, stateVariant } from "./lib/bulk-utils";

export function BulkHistoryCard({
  activeOp,
  opsLoaded,
  ops,
  onSelectOp,
  onRetry,
}: {
  activeOp: string | null;
  opsLoaded: boolean;
  ops: OpListItem[];
  onSelectOp: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const [toggled, setToggled] = useState<boolean | null>(null);
  // Until the user toggles it, open only while an operation is being inspected.
  const open = toggled ?? activeOp !== null;
  return (
    <Card>
      <CardHeader className="p-0">
        <button
          type="button"
          onClick={() => setToggled(!open)}
          aria-expanded={open}
          className="flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left sm:p-5"
        >
          <span>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" aria-hidden="true" />
              Lịch sử thao tác
              {opsLoaded && <Badge variant="secondary">{ops.length}</Badge>}
            </CardTitle>
            <CardDescription className="mt-1">Kết quả chi tiết từng task của các lần chạy gần đây.</CardDescription>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </CardHeader>
      {open && <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
        {!opsLoaded ? (
          <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
        ) : ops.length === 0 ? (
          <EmptyState
            icon={History}
            title="Chưa có thao tác hàng loạt nào"
            description="Các thao tác đã hoàn thành hoặc đang chạy sẽ xuất hiện tại đây."
            className="py-12"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {ops.map((op) => (
              <li key={op.id} className={cn("rounded-lg border p-3 transition-colors", activeOp === op.id && "border-primary bg-primary/[0.03]")}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => onSelectOp(op.id)}
                    className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
                      <span className="font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">#{op.id.slice(0, 8)}</span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {op.succeeded}/{op.total} thành công · {op.failed} thất bại · {formatTime(op.completedAt ?? op.createdAt)}
                    </span>
                  </button>
                  {isTerminalOpState(op.state) && op.state !== "cancelled" && op.failed > 0 && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(op.id)}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Thử lại
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>}
    </Card>
  );
}
