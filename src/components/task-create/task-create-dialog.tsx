"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  ShieldAlert,
  X,
} from "lucide-react";
import type {
  BulkCreateProjectMetadata,
  BulkCreateRequest,
  BulkCreateRowInput,
} from "@/lib/bulk/create-types";
import { api, getErrorMessage } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import { useFlashMessage } from "@/hooks/use-flash-message";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskCreateForm } from "./task-create-form";
import { useSingleTaskCreate } from "./use-single-task-create";
import { isSpinning, type SingleCreatePhase } from "./single-create-model";
import { AiIdeaPanel } from "./ai-idea-panel";
import { AiSplitButton } from "./ai-split-button";
import { useAiEnabled } from "@/hooks/use-ai-enabled";
import {
  applyPrefill,
  canSubmit,
  duplicateKeyFromWarning,
  emptyRow,
  mergeAiPrefill,
  resolveIssueTypeIdByName,
  splitPreviewErrors,
  type TaskCreatePrefill,
} from "./task-create-form-model";

export type { TaskCreatePrefill } from "./task-create-form-model";

/** Context passed to a function-form `extraActions`. */
export type TaskCreateExtraActionsContext = {
  /** A create is in flight (previewing, creating or waiting in the queue). */
  busy: boolean;
  /** Current form row; null until project metadata has loaded. */
  row: BulkCreateRowInput | null;
};

/**
 * Prefill merged into the live form (via `mergeAiPrefill`) each time `seq` changes,
 * without discarding the user's other edits or the in-flight create state.
 */
export type TaskCreateExternalPatch = { seq: number; prefill: TaskCreatePrefill };

const METADATA_STALE_MS = 5 * 60 * 1000;
const DONE_TOAST_MS = 6_000;
const IDLE_PHASE: SingleCreatePhase = { kind: "idle" };

export type TaskCreateDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectKey: string;
  /** Sheet title; defaults to "Tạo task". */
  title?: string;
  prefill?: TaskCreatePrefill;
  /**
   * Issue type to preselect by name (case-insensitive, e.g. "Bug") once metadata
   * loads. Ignored when `prefill.issueTypeId` is set or the user already edited the form.
   */
  prefillIssueTypeName?: string;
  /** Always merged into labels and cannot be removed (Sentry dedup labels). */
  lockedLabels?: string[];
  source: NonNullable<BulkCreateRequest["source"]>;
  endpoint?: string;
  /** Slot under the title for AI actions; the function form gets the busy state and current row. */
  extraActions?: ReactNode | ((ctx: TaskCreateExtraActionsContext) => ReactNode);
  /**
   * Applied once per new `seq` when the form is idle and loaded (a patch arriving
   * before metadata loads waits for it; one arriving during a create is dropped,
   * so callers should disable their trigger while `busy`).
   */
  externalPatch?: TaskCreateExternalPatch | null;
  /**
   * Show "Viết bằng AI" (rough idea → form fields) under the title when the
   * server has AI configured. The suggestion is merged with `mergeAiPrefill`.
   */
  aiAssist?: boolean;
  onCreated?(jiraKey: string): void;
};

function MetadataSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Đang tải thông tin dự án">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Sheet with the shared task form, creating one task through the bulk pipeline.
 *
 * Keep this component mounted and drive it with `open`: creation keeps running
 * after the user closes the sheet, and the success toast is rendered here.
 */
export function TaskCreateDialog({
  open,
  onOpenChange,
  projectKey,
  title = "Tạo task",
  prefill,
  prefillIssueTypeName,
  lockedLabels,
  source,
  endpoint,
  extraActions,
  externalPatch,
  aiAssist = false,
  onCreated,
}: TaskCreateDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<{ projectKey: string; row: BulkCreateRowInput } | null>(null);
  const toast = useFlashMessage<{ jiraKey: string; projectKey: string }>(DONE_TOAST_MS);
  const aiEnabled = useAiEnabled();

  const metadataQuery = useQuery({
    queryKey: bulkKeys.createMetadata(projectKey),
    queryFn: () =>
      api<BulkCreateProjectMetadata>(
        `/api/bulk/create/metadata?project=${encodeURIComponent(projectKey)}`
      ),
    enabled: open && Boolean(projectKey),
    staleTime: METADATA_STALE_MS,
  });
  const metadata = metadataQuery.data;

  const create = useSingleTaskCreate({
    projectKey,
    source,
    endpoint,
    // `createdProjectKey` is captured at submit; the prop may have changed since.
    onCreated: (jiraKey, createdProjectKey) => {
      toast.show({ jiraKey, projectKey: createdProjectKey });
      setDraft(null);
      create.reset();
      onOpenChange(false);
      onCreated?.(jiraKey);
    },
  });
  // Seq of the last external patch handled, and a duplicate prompt made stale by a
  // patch (the hook cannot be reset during render, so that prompt is hidden instead).
  const [patchSeq, setPatchSeq] = useState<number | null>(null);
  const [staleDuplicateOpId, setStaleDuplicateOpId] = useState<string | null>(null);
  const phase: SingleCreatePhase =
    create.phase.kind === "duplicate" && create.phase.operationId === staleDuplicateOpId
      ? IDLE_PHASE
      : create.phase;

  // Untouched form = derived from metadata + prefill; first edit pins it into state.
  const row: BulkCreateRowInput | null =
    draft && draft.projectKey === projectKey
      ? draft.row
      : metadata
        ? applyPrefill(
            emptyRow(metadata),
            {
              ...prefill,
              issueTypeId:
                prefill?.issueTypeId ?? resolveIssueTypeIdByName(metadata, prefillIssueTypeName),
            },
            lockedLabels
          )
        : null;

  const busy = phase.kind === "previewing" || phase.kind === "creating" || phase.kind === "queued-slow";
  const mergeOpts = { lockedLabels, defaultIssueTypeId: metadata?.defaultIssueTypeId };

  // Adjust state on prop change during render (no effect): React re-renders
  // immediately with the merged draft, and the seq guard makes it run once per patch.
  if (externalPatch && externalPatch.seq !== patchSeq && row && metadata) {
    setPatchSeq(externalPatch.seq);
    if (!busy) {
      setDraft({ projectKey, row: mergeAiPrefill(row, externalPatch.prefill, mergeOpts) });
      // Same as handleChange: a pending duplicate confirmation no longer matches the form.
      if (phase.kind === "duplicate") setStaleDuplicateOpId(phase.operationId);
    }
  }
  const check = row && metadata ? canSubmit(row, metadata) : null;
  const blocked =
    phase.kind === "blocked" && metadata ? splitPreviewErrors(phase.errors, metadata) : null;

  function handleChange(next: BulkCreateRowInput) {
    setDraft({ projectKey, row: next });
    // A pending duplicate confirmation refers to the previewed row; edits make it stale.
    if (phase.kind === "duplicate") create.reset();
  }

  function handleAiApply(prefill: TaskCreatePrefill) {
    if (!row || !metadata) return;
    handleChange(mergeAiPrefill(row, prefill, mergeOpts));
  }

  function handleOpenChange(next: boolean) {
    // Closing is always allowed; an in-flight op keeps running server-side.
    if (!next && (phase.kind === "blocked" || phase.kind === "duplicate" || phase.kind === "failed")) {
      create.reset();
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!row || !check?.ok || busy) return;
    create.submit(row);
  }

  let body: ReactNode;
  if (metadataQuery.isError && !metadata) {
    body = (
      <EmptyState
        size="compact"
        icon={AlertTriangle}
        title="Không tải được thông tin dự án"
        hint={getErrorMessage(metadataQuery.error)}
        action={
          <Button
            size="sm"
            variant="outline"
            className="cursor-pointer"
            onClick={() => void metadataQuery.refetch()}
            disabled={metadataQuery.isFetching}
          >
            Thử lại
          </Button>
        }
      />
    );
  } else if (!metadata || !row) {
    body = <MetadataSkeleton />;
  } else {
    body = (
      <div className="space-y-4">
        {!metadata.canCreate && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{metadata.permissionReason || "Bạn không có quyền tạo task trong dự án này."}</span>
          </div>
        )}
        <fieldset disabled={busy} className="min-w-0">
          <TaskCreateForm
            value={row}
            onChange={handleChange}
            metadata={metadata}
            projectKey={projectKey}
            lockedLabels={lockedLabels}
            fieldErrors={blocked?.fieldErrors}
          />
        </fieldset>
      </div>
    );
  }

  const extra = typeof extraActions === "function" ? extraActions({ busy, row }) : extraActions;
  const showAiPanel = aiAssist && aiEnabled && Boolean(row && metadata?.canCreate);
  const headerExtra =
    showAiPanel && row ? (
      <div className="space-y-2">
        <AiIdeaPanel key={projectKey} projectKey={projectKey} current={row} disabled={busy} onApply={handleAiApply} />
        {extra}
      </div>
    ) : (
      extra
    );

  const footer = (
    <div className="space-y-3">
      {blocked && blocked.general.length > 0 && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Chưa tạo được task
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {blocked.general.map((err, i) => (
              <li key={`${err.code}-${i}`}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}
      {phase.kind === "blocked" && blocked && blocked.general.length === 0 && (
        <p role="alert" className="text-xs text-destructive">
          Kiểm tra lại các trường được đánh dấu lỗi.
        </p>
      )}

      {phase.kind === "duplicate" && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-foreground"
        >
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            Có thể trùng với task đã có
          </p>
          <ul className="space-y-1">
            {phase.warnings.map((w, i) => {
              const key = duplicateKeyFromWarning(w);
              return (
                <li key={`${w.code}-${i}`} className="flex flex-wrap items-center gap-x-2">
                  <span>{w.message}</span>
                  {key && (
                    <Link
                      href={`/issue/${key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
                    >
                      Xem {key}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase.kind === "failed" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{phase.message}. Dữ liệu vẫn được giữ, bạn có thể thử lại.</span>
        </div>
      )}

      {phase.kind === "queued-slow" && (
        <p role="status" className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Đang xử lý lâu hơn bình thường, task sẽ được tạo khi worker chạy xong. Bạn có thể đóng form.
        </p>
      )}
      {(phase.kind === "previewing" || phase.kind === "creating") && (
        <p role="status" className="text-xs text-muted-foreground">
          Bạn có thể đóng form, task vẫn tiếp tục được tạo ở máy chủ.
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-2xs text-muted-foreground">
          {!busy && check && !check.ok ? check.reason : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => handleOpenChange(false)}
          >
            Hủy
          </Button>
          {phase.kind === "duplicate" ? (
            <Button size="sm" className="cursor-pointer" onClick={() => create.forceConfirm()}>
              Vẫn tạo
            </Button>
          ) : (
            <Button
              size="sm"
              className="cursor-pointer"
              onClick={handleSubmit}
              disabled={busy || !check?.ok}
              title={!busy && check && !check.ok ? check.reason : undefined}
            >
              {isSpinning(phase) && (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              {phase.kind === "queued-slow" && <Clock aria-hidden="true" />}
              {busy ? "Đang tạo…" : "Tạo task"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        description={metadata ? `${metadata.project.name} (${projectKey})` : projectKey}
        headerExtra={headerExtra}
        footer={footer}
        className="max-w-xl"
      >
        {body}
      </Sheet>

      {toast.message && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[60] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-border bg-popover px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          <span>Đã tạo task</span>
          <Link
            href={`/issue/${toast.message.jiraKey}`}
            className="cursor-pointer text-primary underline-offset-4 transition-colors duration-150 hover:underline"
          >
            {toast.message.jiraKey}
          </Link>
          {source.type === "single" && (
            <AiSplitButton
              key={toast.message.jiraKey}
              projectKey={toast.message.projectKey}
              parentKey={toast.message.jiraKey}
              // Keep the toast open while the AI works and while an error is shown.
              onBusyChange={(splitting) => {
                if (splitting && toast.message) toast.show(toast.message, 0);
              }}
              onErrorChange={(error) => {
                if (error && toast.message) toast.show(toast.message, 0);
              }}
            />
          )}
          <button
            type="button"
            onClick={toast.clear}
            aria-label="Đóng thông báo"
            className="cursor-pointer rounded p-0.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
