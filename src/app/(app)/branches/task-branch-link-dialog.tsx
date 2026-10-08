"use client";

import { useState } from "react";
import { AlertCircle, GitBranch, Link2, Search } from "lucide-react";
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
import { useBranchLink, useUnlinkedBranchPicker } from "@/hooks/use-branches";
import { cn, timeAgo } from "@/lib/utils";

type TaskBranchLinkDialogProps = {
  jiraKey: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/** Attach existing, not-yet-linked Bitbucket branches to a given Jira task. */
export function TaskBranchLinkDialog({
  jiraKey,
  summary,
  open,
  onOpenChange,
  onSuccess,
}: TaskBranchLinkDialogProps) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const linkMutation = useBranchLink();
  const picker = useUnlinkedBranchPicker(q, open);
  const items = picker.data?.unlinkedItems ?? [];
  const error = linkMutation.error ? getErrorMessage(linkMutation.error) : null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSave = () => {
    linkMutation.mutate(
      { branchId: "bulk", body: { action: "link_many", ids: Array.from(selected), jiraKey } },
      {
        onSuccess: () => {
          onSuccess();
          onOpenChange(false);
          linkMutation.reset();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Gắn nhánh vào {jiraKey}
          </DialogTitle>
          <DialogDescription className="line-clamp-1 text-xs">{summary}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm nhánh theo tên hoặc repo"
              className="pl-8 text-sm"
              disabled={linkMutation.isPending}
            />
          </div>

          {picker.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <GitBranch className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">Không có nhánh nào chưa gắn</p>
              <p className="text-xs text-muted-foreground">
                {q.trim() ? "Thử từ khóa khác." : "Tất cả nhánh đang hoạt động đã có Jira task."}
              </p>
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {items.map((item) => (
                <li key={item.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-xs transition-colors duration-150",
                      selected.has(item.id)
                        ? "border-primary/50 bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      disabled={linkMutation.isPending}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-teal-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono font-semibold text-foreground">{item.branch}</span>
                      <span className="block truncate text-muted-foreground">
                        {item.repo}
                        {item.prTitle ? ` · PR: ${item.prTitle}` : ""}
                        {item.lastCommitAt ? ` · ${timeAgo(item.lastCommitAt)}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" disabled={linkMutation.isPending} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button type="button" size="sm" disabled={linkMutation.isPending || selected.size === 0} onClick={handleSave}>
            {linkMutation.isPending ? "Đang lưu..." : `Gắn ${selected.size || ""} nhánh`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
