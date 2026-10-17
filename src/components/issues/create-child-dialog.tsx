"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitFork } from "lucide-react";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getErrorMessage } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import type { ChildMode, ChildTypeOption } from "@/lib/issues/children";

export type CreatedChild = { key: string; summary: string; mode: ChildMode; linkError: string | null };

interface CreateChildDialogProps {
  jiraKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (child: CreatedChild) => void | Promise<void>;
}

/** Jira-style "Create sub-task" / "Create child issue": a title and an issue type. */
export function CreateChildDialog({ jiraKey, open, onOpenChange, onCreated }: CreateChildDialogProps) {
  const [summary, setSummary] = useState("");
  const [typeId, setTypeId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending, error: loadError } = useQuery({
    queryKey: [...issuesKeys.detail(jiraKey), "child-options"] as const,
    queryFn: () => api<{ mode: ChildMode; types: ChildTypeOption[] }>(`/api/issues/${jiraKey}/children`),
    enabled: open,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const types = data?.types ?? [];
  // Until the user picks one, the first type Jira offers is the selection.
  const selectedType = typeId || types[0]?.id || "";
  const trimmed = summary.trim();
  const invalid = !trimmed || !selectedType || trimmed.length > 255;
  const isEpic = data?.mode === "epic";

  async function submit() {
    if (invalid || creating) return;
    setCreating(true);
    setError(null);
    try {
      const child = await api<CreatedChild>(`/api/issues/${jiraKey}/children`, {
        method: "POST",
        body: { summary: trimmed, issueTypeId: selectedType },
      });
      setSummary("");
      onOpenChange(false);
      await onCreated(child);
    } catch (e) {
      setError(getErrorMessage(e, "Không tạo được task."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitFork className="h-4 w-4 text-primary" aria-hidden="true" />
            {isEpic ? "Tạo task trong Epic" : "Tạo sub-task"} · {jiraKey}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEpic
              ? "Tạo task mới trên Jira và gắn vào Epic này."
              : "Tạo sub-task mới trên Jira, thuộc task này."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {(error || loadError) && (
            <FeedbackBanner tone="destructive" className="text-xs">
              <span className="min-w-0 break-words">
                {error ?? getErrorMessage(loadError, "Không đọc được loại task từ Jira.")}
              </span>
            </FeedbackBanner>
          )}

          {isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : types.length === 0 && !loadError ? (
            <p className="text-xs text-muted-foreground">
              Task này không thể có task con, hoặc bạn không có quyền tạo loại task phù hợp.
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="child-type" className="text-xs">Loại task</Label>
                <select
                  id="child-type"
                  value={selectedType}
                  disabled={creating}
                  onChange={(e) => setTypeId(e.target.value)}
                  className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="child-summary" className="text-xs">Tiêu đề</Label>
                <Input
                  id="child-summary"
                  autoFocus
                  value={summary}
                  maxLength={255}
                  disabled={creating}
                  onChange={(e) => setSummary(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                  placeholder="Nhập tiêu đề…"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={creating} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button size="sm" disabled={invalid || creating} onClick={() => void submit()}>
            {creating ? "Đang tạo…" : "Tạo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
