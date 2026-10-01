"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { issuesKeys, bulkKeys, staleKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACTION_LABELS, type OpDetail } from "./lib/bulk-types";
import { stateVariant, itemVariant } from "./lib/bulk-utils";

export function OperationDetail({ id, jiraBaseUrl }: { id: string; jiraBaseUrl: string }) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const returnTo = searchParams?.get("returnTo");
  const returnToTarget =
    returnTo === "standardization"
      ? "/stale?view=my-work&tab=standardization"
      : returnTo?.startsWith("/")
        ? returnTo
        : null;

  const { data, isFetching, refetch } = useQuery({
    queryKey: bulkKeys.op(id),
    queryFn: () => api<OpDetail>(`/api/bulk/operations/${id}`),
    refetchInterval: (query) =>
      ["running", "queued"].includes(query.state.data?.operation.state ?? "") ? 2000 : false,
  });
  const op = data?.operation;

  const opState = op?.state;
  useEffect(() => {
    if (opState && ["completed", "partially_failed", "failed", "cancelled"].includes(opState)) {
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      qc.invalidateQueries({ queryKey: staleKeys.all });
    }
  }, [opState, qc]);

  if (!op) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-md border border-border p-3 text-sm">
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Đang tải chi tiết thao tác…
      </div>
    );
  }

  const done = op.succeeded + op.failed;
  const pct = op.total > 0 ? Math.round((done / op.total) * 100) : 0;
  const isTerminal = ["completed", "partially_failed", "failed", "cancelled"].includes(op.state);

  return (
    <div className="mb-4 rounded-md border border-border p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
        <span className="text-sm font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {done}/{op.total} hoàn thành
        </span>
      </div>
      <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
        {op.items.map((it) => (
          <li key={it.jiraKey} className="flex items-center gap-2">
            <Badge variant={itemVariant(it.status)}>{it.status}</Badge>
            {jiraBaseUrl ? (
              <a
                href={`${jiraBaseUrl}/browse/${it.jiraKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                title={`Mở ${it.jiraKey} trên Jira`}
              >
                {it.jiraKey}
                <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
              </a>
            ) : (
              <span className="font-mono text-xs">{it.jiraKey}</span>
            )}
            {it.attemptCount > 1 && <span className="text-[11px] text-muted-foreground">({it.attemptCount} lần thử)</span>}
            {it.error && <span className="truncate text-xs text-destructive">{it.error}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t pt-2.5">
        {returnToTarget && isTerminal ? (
          <Button asChild size="sm" variant="default" className="cursor-pointer gap-1.5 text-xs">
            <Link href={returnToTarget}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              {returnTo === "standardization" ? "Quay lại danh sách chuẩn hóa" : "Quay lại"}
            </Link>
          </Button>
        ) : (
          <div />
        )}
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden /> Làm mới
        </Button>
      </div>
    </div>
  );
}
