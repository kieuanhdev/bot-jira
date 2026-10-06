import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { History, RefreshCw } from "lucide-react";
import { OperationDetail } from "./bulk-operation-detail";
import { ACTION_LABELS, type OpListItem } from "./lib/bulk-types";
import { formatTime, stateVariant } from "./lib/bulk-utils";

export function BulkHistoryCard({
  activeOp,
  jiraBaseUrl,
  opsLoaded,
  ops,
  onSelectOp,
  onRetry,
}: {
  activeOp: string | null;
  jiraBaseUrl: string;
  opsLoaded: boolean;
  ops: OpListItem[];
  onSelectOp: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" aria-hidden="true" />
          Lịch sử thao tác
        </CardTitle>
        <CardDescription>Các thao tác hàng loạt gần đây và kết quả chi tiết từng task.</CardDescription>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
        {activeOp && <OperationDetail id={activeOp} jiraBaseUrl={jiraBaseUrl} />}
        {!opsLoaded ? (
          <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
        ) : ops.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <p className="font-medium">Chưa có thao tác hàng loạt nào</p>
            <p className="mt-1 text-sm text-muted-foreground">Các thao tác đã hoàn thành hoặc đang chạy sẽ xuất hiện tại đây.</p>
          </div>
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
                  {["completed", "partially_failed", "failed"].includes(op.state) && op.failed > 0 && (
                    <Button size="sm" variant="outline" onClick={() => onRetry(op.id)}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Thử lại
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
