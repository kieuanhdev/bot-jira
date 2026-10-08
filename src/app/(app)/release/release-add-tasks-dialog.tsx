"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ListPlus, Search, ListTodo } from "lucide-react";
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
import { api, getErrorMessage } from "@/lib/api-client";
import { issuesKeys, meKeys, releasesKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type SearchItem = {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
};

type AddTasksDialogProps = {
  projectKey: string;
  version: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/** Quickly attach project tasks to a release by adding its Fix Version to each issue. */
export function ReleaseAddTasksDialog({
  projectKey,
  version,
  open,
  onOpenChange,
  onSuccess,
}: AddTasksDialogProps) {
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string[]>([]);
  const qc = useQueryClient();

  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null }>("/api/me/status"),
    staleTime: 60_000,
  });
  const meName = me?.jiraName ?? null;
  const assignee = onlyMine && meName ? meName : "";

  const search = useQuery({
    queryKey: ["issues", "release-add", projectKey, version, q.trim(), assignee],
    queryFn: () => {
      const p = new URLSearchParams({ project: projectKey, excludeVersion: version, limit: "50" });
      if (q.trim()) p.set("q", q.trim());
      if (assignee) p.set("assignee", assignee);
      return api<{ items: SearchItem[] }>(`/api/issues/search?${p}`);
    },
    enabled: open,
    staleTime: 15_000,
  });
  const items = search.data?.items ?? [];

  const addMutation = useMutation({
    mutationFn: async (keys: string[]) => {
      const results = await Promise.allSettled(
        keys.map((key) => api(`/api/issues/${key}`, { method: "PATCH", body: { addFixVersion: version } }))
      );
      return keys.filter((_, i) => results[i].status === "rejected");
    },
    onSuccess: (failedKeys) => {
      qc.invalidateQueries({ queryKey: releasesKeys.all });
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      setFailed(failedKeys);
      if (failedKeys.length === 0) {
        onSuccess();
        onOpenChange(false);
        setSelected(new Set());
      } else {
        setSelected(new Set(failedKeys));
      }
    },
  });

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.jiraKey));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.jiraKey)));
  const busy = addMutation.isPending;
  const error = addMutation.error
    ? getErrorMessage(addMutation.error)
    : failed.length > 0
      ? `Không thêm được ${failed.length} task: ${failed.join(", ")}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-primary" aria-hidden="true" />
            Thêm task vào {version}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Chọn task của dự án {projectKey} để gán Fix Version &quot;{version}&quot; trên Jira.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo mã hoặc tiêu đề task"
              className="pl-8 text-sm"
              disabled={busy}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={busy || items.length === 0}
                className="h-3.5 w-3.5 cursor-pointer accent-teal-600"
              />
              Chọn tất cả ({items.length})
            </label>
            {meName && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={(e) => setOnlyMine(e.target.checked)}
                  disabled={busy}
                  className="h-3.5 w-3.5 cursor-pointer accent-teal-600"
                />
                Chỉ task của tôi
              </label>
            )}
          </div>

          {search.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <ListTodo className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">Không có task nào để thêm</p>
              <p className="text-xs text-muted-foreground">
                {q.trim() || onlyMine ? "Thử đổi từ khóa hoặc bỏ bộ lọc." : "Mọi task đã nằm trong phiên bản này."}
              </p>
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <li key={item.jiraKey}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors duration-150",
                      selected.has(item.jiraKey) ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.jiraKey)}
                      onChange={() => toggle(item.jiraKey)}
                      disabled={busy}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-teal-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-foreground">{item.jiraKey}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {item.status}
                        </span>
                      </span>
                      <span className="block truncate text-foreground">{item.summary}</span>
                      <span className="block truncate text-muted-foreground">{item.assigneeJira ?? "Chưa gán"}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || selected.size === 0}
            onClick={() => addMutation.mutate(Array.from(selected))}
            className="cursor-pointer"
          >
            {busy ? "Đang thêm..." : `Thêm ${selected.size || ""} task`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
