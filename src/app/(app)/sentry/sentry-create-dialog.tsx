"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  TaskCreateDialog,
  type TaskCreateExternalPatch,
  type TaskCreateExtraActionsContext,
  type TaskCreatePrefill,
} from "@/components/task-create/task-create-dialog";
import { aiOverwriteNeedsConfirm } from "@/components/task-create/task-create-form-model";
import type { BulkCreateProjectMetadata, BulkCreateRowInput, BulkCreateSource } from "@/lib/bulk/create-types";
import { useAiEnabled } from "@/hooks/use-ai-enabled";
import { bulkKeys } from "@/lib/query-keys";
import { sentryLabel } from "@/lib/sentry/idempotency";
import { withAnalysisSection } from "@/lib/sentry/analysis";
import { buildSentryTaskDraft } from "@/lib/sentry/task-draft";
import { formatNumber } from "@/lib/utils";
import { levelVariant, type SentryRowItem } from "./sentry-row";
import { useSentryAnalysis } from "./use-sentry-analysis";
import {
  SentryAiSummaryButton,
  useSentryAiSummary,
  type SentryAiSummaryResult,
} from "./sentry-ai-summary-button";

export interface SentryCreateDialogProps {
  /** Must have a `targetProject`. */
  row: SentryRowItem & { targetProject: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (jiraKey: string) => void;
}

/** Keeps `rowRef` pointing at the form's latest row, for reading in async callbacks. */
function LatestRowSync({
  rowRef,
  row,
}: {
  rowRef: RefObject<BulkCreateRowInput | null>;
  row: BulkCreateRowInput | null;
}) {
  useEffect(() => {
    rowRef.current = row;
  });
  return null;
}

/**
 * Create one Jira task from a Sentry issue with the full task form, filed with the user's Jira
 * token via `/api/sentry/[id]/create`. Keep it mounted per row (`key={row.id}`) and drive it
 * with `open` so an in-flight create survives closing.
 */
export function SentryCreateDialog({ row, open, onOpenChange, onCreated }: SentryCreateDialogProps) {
  const source = useMemo<BulkCreateSource>(() => ({ type: "sentry", sentryImportId: row.id }), [row.id]);
  const lockedLabels = useMemo(() => ["sentry", sentryLabel({ id: row.sentryIssueId })], [row.sentryIssueId]);
  // Read-only here (no auto-request): the analysis queued by the detail drawer goes into the task.
  const analysisResult = useSentryAnalysis(row.id, { enabled: open, autoRequest: false }).query.data?.result ?? null;
  const prefill = useMemo<TaskCreatePrefill>(() => {
    const draft = buildSentryTaskDraft(row);
    const description = row.draftDescription ?? draft.description;
    return {
      summary: row.draftSummary ?? draft.summary,
      description: analysisResult ? withAnalysisSection(description, analysisResult) : description,
    };
  }, [row, analysisResult]);
  const ref = row.shortId ?? row.sentryIssueId;

  // AI summary state lives here, above the sheet content, so it survives closing the form.
  const aiEnabled = useAiEnabled();
  const queryClient = useQueryClient();
  const aiSummary = useSentryAiSummary(row.id);
  const [proposal, setProposal] = useState<SentryAiSummaryResult | null>(null);
  // Merged into the live form by TaskCreateDialog each time `seq` changes.
  const [aiPatch, setAiPatch] = useState<TaskCreateExternalPatch | null>(null);
  const [priorityNote, setPriorityNote] = useState<string | null>(null);
  const formRowRef = useRef<BulkCreateRowInput | null>(null);

  /** Priority id for the suggested name, from the metadata the open form already cached. */
  function resolvePriorityId(name: string | undefined): string | undefined {
    const wanted = name?.trim().toLowerCase();
    if (!wanted) return undefined;
    const metadata = queryClient.getQueryData<BulkCreateProjectMetadata>(
      bulkKeys.createMetadata(row.targetProject)
    );
    if (!metadata?.fieldCapabilities.priority.available) return undefined;
    return metadata.priorityOptions.find((p) => p.name.trim().toLowerCase() === wanted)?.id;
  }

  function prefillFor(result: SentryAiSummaryResult): TaskCreatePrefill {
    const priorityId = resolvePriorityId(result.priorityName);
    return {
      summary: result.summary,
      description: result.description,
      ...(priorityId ? { priorityId } : {}),
    };
  }

  function applyAiSummary(result: SentryAiSummaryResult) {
    const next = prefillFor(result);
    setAiPatch((prev) => ({ seq: (prev?.seq ?? 0) + 1, prefill: next }));
    setPriorityNote(
      result.priorityName && !next.priorityId
        ? `Không tìm thấy priority "${result.priorityName}" trong project, giữ mặc định.`
        : null
    );
    setProposal(null);
  }

  function runAiSummary() {
    setProposal(null);
    setPriorityNote(null);
    aiSummary.mutate(undefined, {
      onSuccess: (result) => {
        // Ask first only when it would replace a summary/description the user has.
        const current = formRowRef.current;
        if (current && !aiOverwriteNeedsConfirm(current, prefillFor(result))) applyAiSummary(result);
        else setProposal(result);
      },
    });
  }

  // Sentry context, plus the "AI tóm tắt lỗi" action when the server has an LLM.
  function extraActions({ busy, row: formRow }: TaskCreateExtraActionsContext) {
    const proposalPrefill = proposal ? prefillFor(proposal) : null;
    const proposalSetsPriority = Boolean(proposalPrefill?.priorityId && !formRow?.priorityId);
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <LatestRowSync rowRef={formRowRef} row={formRow} />
        <Badge variant={levelVariant(row.level)} className="uppercase">
          {row.level ?? "?"}
        </Badge>
        {row.eventCount !== null && <span>{formatNumber(row.eventCount)} lần xảy ra</span>}
        {row.permalinkUrl && (
          <a
            href={row.permalinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
          >
            Xem trên Sentry
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {aiEnabled && (
          <SentryAiSummaryButton
            pending={aiSummary.isPending}
            disabled={busy || !formRow}
            error={aiSummary.error}
            usedEvent={aiSummary.data?.usedEvent ?? null}
            proposal={proposal}
            proposalSetsPriority={proposalSetsPriority}
            note={priorityNote}
            onRun={runAiSummary}
            onApply={() => proposal && applyAiSummary(proposal)}
            onDismiss={() => setProposal(null)}
          />
        )}
      </div>
    );
  }

  return (
    <TaskCreateDialog
      open={open}
      onOpenChange={onOpenChange}
      projectKey={row.targetProject}
      title={`Tạo task từ lỗi Sentry ${ref}`}
      prefill={prefill}
      prefillIssueTypeName={buildSentryTaskDraft(row).issueType}
      lockedLabels={lockedLabels}
      source={source}
      endpoint={`/api/sentry/${row.id}/create`}
      extraActions={extraActions}
      externalPatch={aiPatch}
      onCreated={onCreated}
    />
  );
}
