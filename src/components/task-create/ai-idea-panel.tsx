"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { BulkCreateRowInput, BulkCreateValidationWarning } from "@/lib/bulk/create-types";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { aiOverwriteNeedsConfirm, type TaskCreatePrefill } from "./task-create-form-model";

/** Must match MAX_IDEA_LENGTH in src/lib/ai/task-draft-prompt.ts (server-only module). */
const MAX_IDEA_LENGTH = 4000;
const AI_ERROR_MESSAGE = "AI không phản hồi, thử lại";

type TaskDraftResponse = {
  prefill: TaskCreatePrefill;
  warnings: BulkCreateValidationWarning[];
};

export type AiIdeaPanelProps = {
  projectKey: string;
  /** Current form row: sent as context and used to decide whether to confirm overwrite. */
  current: BulkCreateRowInput;
  /** Disable while the task is being created. */
  disabled?: boolean;
  /** Merge the suggestion into the form (caller applies the merge rules). */
  onApply(prefill: TaskCreatePrefill): void;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "confirm"; result: TaskDraftResponse }
  | { kind: "applied"; warnings: string[] };

function errorMessage(err: unknown): string {
  // 4xx carry an actionable server message (missing Jira token, idea too long…).
  if (err instanceof ApiError && err.status !== null && err.status < 500) return err.message;
  return AI_ERROR_MESSAGE;
}

/**
 * "Viết bằng AI": turns a rough idea into suggested form fields. Only fills the
 * form; the user still reviews and presses "Tạo task".
 */
export function AiIdeaPanel({ projectKey, current, disabled, onApply }: AiIdeaPanelProps) {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const panelId = useId();
  const textareaId = useId();

  // Results arrive asynchronously: read the latest row/callback, not the ones
  // captured when the request started.
  const latest = useRef({ current, onApply });
  useEffect(() => {
    latest.current = { current, onApply };
  });
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = requestSeq;
    return () => {
      // Invalidate in-flight requests on unmount (sheet closed).
      seq.current += 1;
    };
  }, []);

  const loading = status.kind === "loading";
  const trimmed = idea.trim();
  const canGenerate = !disabled && !loading && trimmed.length > 0 && idea.length <= MAX_IDEA_LENGTH;

  function apply(result: TaskDraftResponse, keepText: boolean) {
    const prefill: TaskCreatePrefill = { ...result.prefill };
    if (keepText) {
      // Keep what the user wrote; still fill summary/description if they are empty.
      const row = latest.current.current;
      if (row.summary.trim()) delete prefill.summary;
      if (row.description?.trim()) delete prefill.description;
    }
    latest.current.onApply(prefill);
    setStatus({ kind: "applied", warnings: result.warnings.map((w) => w.message) });
  }

  async function generate() {
    if (!canGenerate) return;
    const seq = ++requestSeq.current;
    setStatus({ kind: "loading" });
    try {
      const row = latest.current.current;
      const result = await api<TaskDraftResponse>("/api/ai/task-draft", {
        method: "POST",
        body: {
          projectKey,
          idea: trimmed,
          current: { summary: row.summary, description: row.description },
        },
      });
      if (seq !== requestSeq.current) return;
      if (aiOverwriteNeedsConfirm(latest.current.current, result.prefill)) {
        setStatus({ kind: "confirm", result });
      } else {
        apply(result, false);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setStatus({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="cursor-pointer"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <Sparkles className="text-primary" aria-hidden="true" />
        Viết bằng AI
      </Button>

      {open && (
        <div id={panelId} className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <label htmlFor={textareaId} className="sr-only">
            Ý tưởng công việc
          </label>
          <Textarea
            id={textareaId}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void generate();
              }
            }}
            maxLength={MAX_IDEA_LENGTH}
            rows={3}
            disabled={loading || disabled}
            placeholder="Mô tả ngắn công việc, ví dụ: thêm nút xuất Excel ở màn báo cáo"
            className="resize-y bg-background"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground" aria-live="polite">
              {idea.length}/{MAX_IDEA_LENGTH}
            </span>
            <Button
              type="button"
              size="sm"
              className="cursor-pointer"
              onClick={() => void generate()}
              disabled={!canGenerate}
            >
              {loading ? (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {loading ? "Đang tạo…" : "Tạo nội dung"}
            </Button>
          </div>

          {loading && (
            <div className="space-y-1.5" aria-busy="true" aria-label="AI đang soạn nội dung">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}

          {status.kind === "error" && (
            <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {status.message}
            </p>
          )}

          {status.kind === "confirm" && (
            <div role="alert" className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
              <p className="font-medium">Ghi đè tiêu đề và mô tả hiện tại?</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="cursor-pointer"
                  onClick={() => apply(status.result, false)}
                >
                  Ghi đè
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => apply(status.result, true)}
                >
                  Giữ nội dung hiện tại
                </Button>
              </div>
            </div>
          )}

          {status.kind === "applied" && (
            <div role="status" className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                Đã điền gợi ý vào form, kiểm tra lại trước khi tạo.
              </p>
              {status.warnings.length > 0 && <p>{status.warnings.join(" ")}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
