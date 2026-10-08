"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, GitPullRequest, ChevronDown, MinusCircle, Search, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/api-client";
import {
  useCreatePullRequests,
  usePrPlan,
  type PrCreateResult,
  type PrPlanItem,
} from "@/hooks/use-branches";
import { cn } from "@/lib/utils";

type TaskPrCreateDialogProps = {
  jiraKey: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (note: string) => void;
};

const SKIP_REASON: Record<Exclude<PrPlanItem["status"], "ready">, string> = {
  has_open_pr: "Đã có PR đang mở",
  merged: "Nhánh đã merge",
  same_as_target: "Trùng nhánh đích",
};

const RESULT_LABEL: Record<PrCreateResult["status"], string> = {
  created: "Đã tạo PR",
  skipped_open_pr: "Đã có PR đang mở",
  skipped_merged: "Nhánh đã merge",
  skipped_same_target: "Trùng nhánh đích",
  no_changes: "Không có commit mới",
  forbidden: "Không có quyền",
  error: "Lỗi",
};

/** Bulk-create pull requests for every branch linked to a task (one per repo). */
export function TaskPrCreateDialog({ jiraKey, summary, open, onOpenChange, onSuccess }: TaskPrCreateDialogProps) {
  const plan = usePrPlan(jiraKey, open);
  const createMutation = useCreatePullRequests();
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<PrCreateResult[] | null>(null);
  const [q, setQ] = useState("");
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [targetQ, setTargetQ] = useState("");

  const items = plan.data?.plan.items ?? [];
  const ready = items.filter((i) => i.status === "ready" && !unchecked.has(i.branchId));
  const term = q.trim().toLowerCase();
  const visible = term
    ? items.filter((i) => `${i.repo} ${i.branch}`.toLowerCase().includes(term))
    : items;
  const visibleReady = visible.filter((i) => i.status === "ready");
  const allVisibleChecked = visibleReady.length > 0 && visibleReady.every((i) => !unchecked.has(i.branchId));
  const error = plan.error
    ? getErrorMessage(plan.error)
    : createMutation.error
      ? getErrorMessage(createMutation.error)
      : null;

  const toggle = (id: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleVisible = () =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      for (const i of visibleReady) {
        if (allVisibleChecked) next.add(i.branchId);
        else next.delete(i.branchId);
      }
      return next;
    });

  const pickTarget = (branchId: string, name: string) => {
    setTargets((t) => ({ ...t, [branchId]: name }));
    setOpenTarget(null);
    setTargetQ("");
  };

  const handleCreate = () => {
    createMutation.mutate(
      {
        jiraKey,
        branchIds: ready.map((i) => i.branchId),
        targets: Object.fromEntries(ready.map((i) => [i.branchId, targets[i.branchId] ?? i.target])),
      },
      {
        onSuccess: (res) => {
          setResults(res.results);
          onSuccess(res.summary);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-primary" aria-hidden="true" />
            Tạo Pull Request cho {jiraKey}
          </DialogTitle>
          <DialogDescription className="line-clamp-1 text-xs">{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {results ? (
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
              {results.map((r) => (
                <li
                  key={r.branchId}
                  className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-xs"
                >
                  {r.status === "created" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                  ) : r.status === "error" || r.status === "forbidden" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
                  ) : (
                    <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.repo}
                      </span>
                      <span className="truncate font-mono font-semibold">{r.branch}</span>
                      <span className="text-muted-foreground">→ {r.target}</span>
                    </span>
                    <span className="mt-0.5 block text-muted-foreground">
                      {RESULT_LABEL[r.status]}
                      {r.message ? ` — ${r.message}` : ""}
                    </span>
                  </span>
                  {r.prUrl && (
                    <a
                      href={r.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-primary hover:underline"
                    >
                      PR #{r.prId}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : plan.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <GitPullRequest className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">Task chưa có nhánh nào</p>
              <p className="text-xs text-muted-foreground">Gắn nhánh vào task trước khi tạo PR.</p>
            </div>
          ) : (
            <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tìm theo repo hoặc tên nhánh"
                  className="pl-8 text-sm"
                  disabled={createMutation.isPending}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={toggleVisible}
                disabled={visibleReady.length === 0 || createMutation.isPending}
                className="shrink-0 cursor-pointer text-xs"
              >
                {allVisibleChecked ? "Bỏ chọn" : "Chọn"} {visibleReady.length} kết quả
              </Button>
            </div>
            {visible.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">Không có repo hoặc nhánh nào khớp &quot;{q.trim()}&quot;.</p>
            )}
            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
              {visible.map((item) => {
                const isReady = item.status === "ready";
                const checked = isReady && !unchecked.has(item.branchId);
                return (
                  <li
                    key={item.branchId}
                    className={cn(
                      "flex flex-wrap items-center gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors duration-150",
                      checked ? "border-primary/50 bg-primary/5" : "border-border",
                      !isReady && "opacity-70"
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Tạo PR cho ${item.repo} ${item.branch}`}
                      checked={checked}
                      disabled={!isReady || createMutation.isPending}
                      onChange={() => toggle(item.branchId)}
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-teal-600 disabled:cursor-not-allowed"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {item.repo}
                        </span>
                        <span className="truncate font-mono font-semibold text-foreground">{item.branch}</span>
                      </span>
                      {item.status !== "ready" && (
                        <span className="mt-0.5 block text-muted-foreground">{SKIP_REASON[item.status]}</span>
                      )}
                    </span>
                    {isReady && (
                      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                        <span aria-hidden="true">→</span>
                        <button
                          type="button"
                          aria-label={`Nhánh đích của ${item.repo}`}
                          aria-expanded={openTarget === item.branchId}
                          disabled={createMutation.isPending}
                          onClick={() => {
                            setTargetQ("");
                            setOpenTarget((cur) => (cur === item.branchId ? null : item.branchId));
                          }}
                          className="flex h-7 w-40 cursor-pointer items-center justify-between gap-1 rounded-md border border-input px-2 font-mono text-xs text-foreground transition-colors duration-150 hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <span className="truncate">{targets[item.branchId] ?? item.target}</span>
                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    {isReady && openTarget === item.branchId && (
                      <div className="basis-full rounded-md border border-border bg-popover">
                        <div className="relative border-b border-border p-1.5">
                          <Search className="pointer-events-none absolute left-3.5 top-3.5 h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <Input
                            autoFocus
                            value={targetQ}
                            onChange={(e) => setTargetQ(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.stopPropagation();
                                setOpenTarget(null);
                              } else if (e.key === "Enter" && targetQ.trim()) {
                                e.preventDefault();
                                const first = item.targetOptions.find((n) =>
                                  n.toLowerCase().includes(targetQ.trim().toLowerCase())
                                );
                                pickTarget(item.branchId, first ?? targetQ.trim());
                              }
                            }}
                            placeholder={`Tìm nhánh đích trong ${item.repo.split("/").pop()}`}
                            className="h-7 pl-6 text-xs"
                          />
                        </div>
                        <ul role="listbox" className="max-h-40 overflow-y-auto py-1">
                          {item.targetOptions
                            .filter((n) => n.toLowerCase().includes(targetQ.trim().toLowerCase()))
                            .map((name) => (
                              <li
                                key={name}
                                role="option"
                                aria-selected={name === (targets[item.branchId] ?? item.target)}
                                onClick={() => pickTarget(item.branchId, name)}
                                className={cn(
                                  "cursor-pointer truncate px-2.5 py-1 font-mono text-xs transition-colors duration-150 hover:bg-accent",
                                  name === (targets[item.branchId] ?? item.target) && "font-semibold text-primary"
                                )}
                              >
                                {name}
                              </li>
                            ))}
                          {targetQ.trim() && !item.targetOptions.includes(targetQ.trim()) && (
                            <li
                              role="option"
                              aria-selected={false}
                              onClick={() => pickTarget(item.branchId, targetQ.trim())}
                              className="cursor-pointer truncate px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent"
                            >
                              Dùng &quot;<span className="font-mono">{targetQ.trim()}</span>&quot;
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            {results ? "Đóng" : "Hủy"}
          </Button>
          {!results && (
            <Button
              type="button"
              onClick={handleCreate}
              disabled={ready.length === 0 || createMutation.isPending}
              className="cursor-pointer"
            >
              {createMutation.isPending ? "Đang tạo…" : `Tạo ${ready.length} PR`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
