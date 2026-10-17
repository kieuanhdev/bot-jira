"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Info } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { TaskCreateDialog, type TaskCreatePrefill } from "@/components/task-create/task-create-dialog";
import type { BulkCreateProjectMetadata, BulkCreateSource } from "@/lib/bulk/create-types";
import { useAiEnabled } from "@/hooks/use-ai-enabled";
import { bulkKeys } from "@/lib/query-keys";
import { sentryLabel } from "@/lib/sentry/idempotency";
import { buildSentryTaskDraft } from "@/lib/sentry/task-draft";
import { formatNumber } from "@/lib/utils";
import { levelVariant, type SentryRowItem } from "./sentry-row";
import {
  SentryAiSummaryButton,
  useSentryAiSummary,
  type SentryAiSummaryResult,
} from "./sentry-ai-summary-button";

const MAX_LISTED = 5;

export interface SentryApproveDialogProps {
  /** Rows about to be filed by the import worker; null/empty closes the dialog. */
  rows: SentryRowItem[] | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirms approving issues as listed (the worker files them with the generated
 * draft). A single issue with a mapped Jira project is approved through the full
 * task form instead; this dialog only sees one issue when its project is unmapped.
 */
export function SentryApproveDialog({ rows, pending, onCancel, onConfirm }: SentryApproveDialogProps) {
  if (!rows || rows.length === 0) return null;
  const single = rows.length === 1;
  const unmapped = rows.some((r) => !r.targetProject);

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      icon={CheckCircle2}
      title={single ? "Tạo task Jira từ issue này?" : `Tạo ${rows.length} task Jira?`}
      description={
        single
          ? "Task được tạo với nội dung bên dưới. Sentry không bị thay đổi."
          : "Xem lại danh sách trước khi tạo. Muốn sửa nội dung từng task thì duyệt từng issue một."
      }
      confirmLabel={single ? "Tạo task" : `Tạo ${rows.length} task`}
      pending={pending}
      onConfirm={onConfirm}
      className="sm:max-w-xl"
    >
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
        {unmapped && (
          <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {single
                ? "Issue chưa map sang project Jira nên không sửa được nội dung trước khi tạo. "
                : "Có issue chưa map sang project Jira. "}
              Task sẽ được tạo ở project theo cấu hình mapping Sentry (hoặc project mặc định).
            </span>
          </p>
        )}
        {rows.slice(0, MAX_LISTED).map((row) => (
          <div key={row.id} className="flex flex-col gap-1 rounded-md border bg-muted/20 p-3 text-xs">
            <span className="text-muted-foreground">
              Project Jira: <strong className="text-foreground">{row.targetProject ?? "chưa map"}</strong>
            </span>
            <p className="text-sm font-medium text-foreground">
              {row.draftSummary ?? buildSentryTaskDraft(row).summary}
            </p>
          </div>
        ))}
        {rows.length > MAX_LISTED && (
          <p className="text-xs text-muted-foreground">…và {rows.length - MAX_LISTED} issue khác.</p>
        )}
      </div>
    </ConfirmDialog>
  );
}

export interface SentryTaskCreateDialogProps {
  /** Must have a `targetProject`; rows without one go through `SentryApproveDialog`. */
  row: SentryRowItem & { targetProject: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (jiraKey: string) => void;
}

/**
 * Approve one Sentry issue with the full task form, filed with the admin's Jira
 * token via `/api/admin/sentry-import/[id]/create`. Keep it mounted per row
 * (`key={row.id}`) and drive it with `open` so an in-flight create survives closing.
 */
export function SentryTaskCreateDialog({ row, open, onOpenChange, onCreated }: SentryTaskCreateDialogProps) {
  const source = useMemo<BulkCreateSource>(() => ({ type: "sentry", sentryImportId: row.id }), [row.id]);
  const lockedLabels = useMemo(() => ["sentry", sentryLabel({ id: row.sentryIssueId })], [row.sentryIssueId]);
  const basePrefill = useMemo<TaskCreatePrefill>(() => {
    const draft = buildSentryTaskDraft(row);
    return {
      summary: row.draftSummary ?? draft.summary,
      description: row.draftDescription ?? draft.description,
    };
  }, [row]);
  const ref = row.shortId ?? row.sentryIssueId;

  // AI summary state lives here, above the remounted form, so it survives applying.
  const aiEnabled = useAiEnabled();
  const queryClient = useQueryClient();
  const aiSummary = useSentryAiSummary(row.id);
  const [proposal, setProposal] = useState<SentryAiSummaryResult | null>(null);
  const [aiPrefill, setAiPrefill] = useState<TaskCreatePrefill | null>(null);
  // Bumped to remount TaskCreateDialog so it re-derives the form from the new prefill.
  const [formKey, setFormKey] = useState(0);
  const [priorityNote, setPriorityNote] = useState<string | null>(null);

  function runAiSummary() {
    setProposal(null);
    setPriorityNote(null);
    aiSummary.mutate(undefined, { onSuccess: (result) => setProposal(result) });
  }

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
  const proposalPriorityId = resolvePriorityId(proposal?.priorityName);

  function applyAiSummary() {
    if (!proposal) return;
    setAiPrefill({
      ...basePrefill,
      summary: proposal.summary,
      description: proposal.description,
      ...(proposalPriorityId ? { priorityId: proposalPriorityId } : {}),
    });
    setPriorityNote(
      proposal.priorityName && !proposalPriorityId
        ? `Không tìm thấy priority "${proposal.priorityName}" trong project, giữ mặc định.`
        : null
    );
    setFormKey((k) => k + 1);
    setProposal(null);
  }

  // Sentry context, plus the "AI tóm tắt lỗi" action when the server has an LLM.
  const extraActions = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
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
          error={aiSummary.error}
          usedEvent={aiSummary.data?.usedEvent ?? null}
          proposal={proposal}
          proposalSetsPriority={Boolean(proposalPriorityId)}
          note={priorityNote}
          onRun={runAiSummary}
          onApply={applyAiSummary}
          onDismiss={() => setProposal(null)}
        />
      )}
    </div>
  );

  return (
    <TaskCreateDialog
      key={formKey}
      open={open}
      onOpenChange={onOpenChange}
      projectKey={row.targetProject}
      title={`Tạo task từ lỗi Sentry ${ref}`}
      prefill={aiPrefill ?? basePrefill}
      prefillIssueTypeName={buildSentryTaskDraft(row).issueType}
      lockedLabels={lockedLabels}
      source={source}
      endpoint={`/api/admin/sentry-import/${row.id}/create`}
      extraActions={extraActions}
      onCreated={onCreated}
    />
  );
}
