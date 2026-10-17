"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildSentryTaskDraft } from "@/lib/sentry/task-draft";
import type { SentryRowItem } from "./sentry-row";

const MAX_LISTED = 5;
const MAX_SUMMARY = 255;
const MAX_DESCRIPTION = 30_000;

export type ApproveEdits = { summary?: string; description?: string };

export interface SentryApproveDialogProps {
  /** Rows about to be filed; null/empty closes the dialog. */
  rows: SentryRowItem[] | null;
  pending: boolean;
  onCancel: () => void;
  /** `edits` is set only for a single issue whose title/description was changed. */
  onConfirm: (edits?: ApproveEdits) => void;
}

/** Shows exactly what the worker will create in Jira; a single issue is editable. */
export function SentryApproveDialog({ rows, pending, onCancel, onConfirm }: SentryApproveDialogProps) {
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) {
    return <SingleApprove key={rows[0].id} row={rows[0]} pending={pending} onCancel={onCancel} onConfirm={onConfirm} />;
  }
  return <BulkApprove rows={rows} pending={pending} onCancel={onCancel} onConfirm={() => onConfirm()} />;
}

function SingleApprove({
  row,
  pending,
  onCancel,
  onConfirm,
}: {
  row: SentryRowItem;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (edits?: ApproveEdits) => void;
}) {
  const generated = buildSentryTaskDraft(row);
  const initialSummary = row.draftSummary ?? generated.summary;
  const initialDescription = row.draftDescription ?? generated.description;
  const [summary, setSummary] = useState(initialSummary);
  const [description, setDescription] = useState(initialDescription);

  const summaryInvalid = !summary.trim() || summary.length > MAX_SUMMARY || /[\r\n]/.test(summary);
  const descriptionInvalid = description.length > MAX_DESCRIPTION;
  const changed = summary !== initialSummary || description !== initialDescription;

  function confirm() {
    if (!changed) return onConfirm();
    onConfirm({
      ...(summary !== initialSummary ? { summary } : {}),
      ...(description !== initialDescription ? { description } : {}),
    });
  }

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      icon={CheckCircle2}
      title="Tạo task Jira từ issue này?"
      description="Xem lại và chỉnh sửa nội dung nếu cần. Task được tạo trên Jira, Sentry không bị thay đổi."
      confirmLabel="Tạo task"
      pending={pending}
      disabled={summaryInvalid || descriptionInvalid}
      onConfirm={confirm}
      className="sm:max-w-xl"
    >
      <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            Project Jira: <strong className="text-foreground">{row.targetProject ?? "chưa map"}</strong>
          </span>
          <span>
            Loại: <strong className="text-foreground">{generated.issueType}</strong>
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sentry-task-summary" className="text-xs text-muted-foreground">
            Tiêu đề
          </Label>
          <Input
            id="sentry-task-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={MAX_SUMMARY}
            aria-invalid={summaryInvalid}
            disabled={pending}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sentry-task-description" className="text-xs text-muted-foreground">
            Mô tả
          </Label>
          <Textarea
            id="sentry-task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={9}
            className="font-mono text-xs"
            aria-invalid={descriptionInvalid}
            disabled={pending}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}

function BulkApprove({
  rows,
  pending,
  onCancel,
  onConfirm,
}: {
  rows: SentryRowItem[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      icon={CheckCircle2}
      title={`Tạo ${rows.length} task Jira?`}
      description="Xem lại danh sách trước khi tạo. Muốn sửa nội dung từng task thì duyệt từng issue một."
      confirmLabel={`Tạo ${rows.length} task`}
      pending={pending}
      onConfirm={onConfirm}
      className="sm:max-w-xl"
    >
      <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
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
