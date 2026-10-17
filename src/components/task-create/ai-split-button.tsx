"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListTree, Loader2 } from "lucide-react";
import type { BulkCreateRowInput } from "@/lib/bulk/create-types";
import { api, ApiError } from "@/lib/api-client";
import { writeHandoff } from "@/lib/bulk/handoff";
import { useAiEnabled } from "@/hooks/use-ai-enabled";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AI_ERROR_MESSAGE = "AI không phản hồi, thử lại";

export type AiSplitButtonProps = {
  projectKey: string;
  /** Task to split; the server reads its summary, description and type from Jira. */
  parentKey: string;
  /** Called when a split starts/ends (e.g. to keep a toast open meanwhile). */
  onBusyChange?(busy: boolean): void;
  /** Called when the error message appears or is cleared. */
  onErrorChange?(error: string | null): void;
  className?: string;
};

function errorMessage(err: unknown): string {
  // 4xx carry an actionable server message (sub-task parent, no permission…).
  if (err instanceof ApiError && err.status !== null && err.status < 500) return err.message;
  return AI_ERROR_MESSAGE;
}

/**
 * "Tách sub-task bằng AI": asks the AI to split a task, then opens the bulk
 * create screen with the suggested rows (nothing is created until the user
 * confirms there). Hidden when the server has no AI configured.
 */
export function AiSplitButton({ projectKey, parentKey, onBusyChange, onErrorChange, className }: AiSplitButtonProps) {
  const aiEnabled = useAiEnabled();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ onBusyChange, onErrorChange });
  useEffect(() => {
    callbacks.current = { onBusyChange, onErrorChange };
  });

  if (!aiEnabled) return null;

  function updateError(next: string | null) {
    setError(next);
    callbacks.current.onErrorChange?.(next);
  }

  async function split() {
    if (loading) return;
    setLoading(true);
    updateError(null);
    callbacks.current.onBusyChange?.(true);
    let navigating = false;
    try {
      const { items } = await api<{ items: BulkCreateRowInput[] }>("/api/ai/subtask-split", {
        method: "POST",
        body: { projectKey, parentKey },
      });
      let id: string;
      try {
        id = writeHandoff(projectKey, items);
      } catch (err) {
        // writeHandoff throws a user-readable message (storage blocked or full).
        updateError((err as Error).message);
        return;
      }
      // Stay in the loading state while the bulk screen opens.
      navigating = true;
      router.push(
        `/bulk/create?project=${encodeURIComponent(projectKey)}&handoff=${encodeURIComponent(id)}`
      );
    } catch (err) {
      updateError(errorMessage(err));
    } finally {
      if (!navigating) {
        setLoading(false);
        callbacks.current.onBusyChange?.(false);
      }
    }
  }

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 cursor-pointer gap-1.5 text-xs"
        onClick={() => void split()}
        disabled={loading}
        aria-busy={loading}
        title="AI đề xuất danh sách sub-task rồi mở màn tạo hàng loạt để bạn kiểm tra"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <ListTree className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
        )}
        {loading ? "Đang tách sub-task…" : "Tách sub-task bằng AI"}
      </Button>
      {error && (
        <span role="alert" className="inline-flex items-start gap-1 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </span>
      )}
    </span>
  );
}
