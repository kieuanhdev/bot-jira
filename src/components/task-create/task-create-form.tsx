"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import type {
  BulkCreateFieldDefaults,
  BulkCreateProjectMetadata,
  BulkCreateRowInput,
} from "@/lib/bulk/create-types";
import { MAX_SUMMARY_LENGTH } from "@/lib/bulk/create-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AssigneeCombobox,
  ComponentsField,
  DescriptionEditor,
  DueDateField,
  DynamicCustomFields,
  EstimateField,
  FixVersionField,
  IssueTypeField,
  LabelCombobox,
  ParentCombobox,
  PointsField,
  PriorityField,
} from "@/components/task-fields";
import { withLockedLabels } from "./task-create-form-model";

const EMPTY_DEFAULTS: BulkCreateFieldDefaults = {};

export type TaskCreateFormProps = {
  value: BulkCreateRowInput;
  onChange(row: BulkCreateRowInput): void;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  /** Labels always merged into `labels`; removing them in the combobox has no effect. */
  lockedLabels?: string[];
  /** Inline errors keyed by row field (`summary`, `issueTypeId`, `parent`, …). */
  fieldErrors?: Record<string, string>;
  /** Bulk-only: batch defaults used for placeholders and the effective issue type. */
  defaults?: BulkCreateFieldDefaults;
  /** Bulk-only: other rows of the batch, offered as `{type:"batch"}` parent candidates. */
  batchItems?: BulkCreateRowInput[];
};

function FieldBlock({
  id,
  label,
  required,
  error,
  hint,
  children,
}: {
  id?: string;
  label: ReactNode;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-2xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-2xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Full set of task fields shared by the board/Sentry create dialog and the bulk
 * detail sheet, so both always render the same fields in the same order.
 */
export function TaskCreateForm({
  value: item,
  onChange,
  metadata,
  projectKey,
  lockedLabels,
  fieldErrors = {},
  defaults = EMPTY_DEFAULTS,
  batchItems,
}: TaskCreateFormProps) {
  const subtaskIssueTypeIds = new Set(metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id));
  const isSubtask = Boolean(item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId));
  const hasLockedLabels = Boolean(lockedLabels && lockedLabels.length > 0);

  function update(patch: Partial<BulkCreateRowInput>) {
    onChange(withLockedLabels({ ...item, ...patch }, lockedLabels));
  }

  return (
    <div className="space-y-5">
      <FieldBlock
        id="task-create-summary"
        label="Tiêu đề"
        required
        error={fieldErrors.summary}
        hint={
          item.summary.length > MAX_SUMMARY_LENGTH * 0.8
            ? `${item.summary.length}/${MAX_SUMMARY_LENGTH} ký tự`
            : undefined
        }
      >
        <Input
          id="task-create-summary"
          value={item.summary}
          onChange={(e) => update({ summary: e.target.value })}
          placeholder="Nhập tiêu đề công việc..."
          className="h-9 text-sm"
          aria-invalid={fieldErrors.summary ? true : undefined}
        />
      </FieldBlock>

      <FieldBlock label="Loại task" required error={fieldErrors.issueTypeId}>
        <IssueTypeField
          value={item.issueTypeId}
          onChange={(newType) => {
            const isEpic = newType
              ? metadata.issueTypes.find((t) => t.id === newType)?.name.toLowerCase() === "epic"
              : false;
            const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
            if (isEpic) patch.parent = null;
            update(patch);
          }}
          metadata={metadata}
          defaults={defaults}
          className="h-9"
        />
      </FieldBlock>

      <FieldBlock label="Task cha / Epic" required={isSubtask} error={fieldErrors.parent}>
        <ParentCombobox
          projectKey={projectKey}
          value={item.parent}
          onChange={(parent) => update({ parent })}
          batchItems={batchItems}
          currentClientRef={item.clientRef}
          subtaskIssueTypeIds={subtaskIssueTypeIds}
          placeholder={isSubtask ? "Bắt buộc *" : "Chọn Epic / Task cha (tùy chọn)"}
        />
      </FieldBlock>

      <FieldBlock label="Người thực hiện" error={fieldErrors.assignee}>
        <AssigneeCombobox
          projectKey={projectKey}
          value={item.assignee ?? null}
          onChange={(username) => update({ assignee: username })}
          placeholder={defaults.assignee || "Chưa gán"}
        />
      </FieldBlock>

      <FieldBlock label="Mức ưu tiên" error={fieldErrors.priorityId}>
        <PriorityField
          value={item.priorityId}
          onChange={(priorityId) => update({ priorityId })}
          metadata={metadata}
          defaults={defaults}
          className="h-9"
        />
      </FieldBlock>

      {metadata.components && metadata.components.length > 0 && (
        <FieldBlock label="Hợp phần (Components)" error={fieldErrors.componentIds}>
          <ComponentsField
            metadata={metadata}
            value={item.componentIds}
            onChange={(componentIds) => update({ componentIds })}
            defaults={defaults}
          />
        </FieldBlock>
      )}

      <FieldBlock
        label="Nhãn"
        error={fieldErrors.labels}
        hint={
          hasLockedLabels ? (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Luôn gắn: {lockedLabels!.join(", ")}
            </span>
          ) : undefined
        }
      >
        <LabelCombobox
          projectKey={projectKey}
          value={item.labels}
          onChange={(labels) => update({ labels })}
          placeholder="Thêm nhãn…"
        />
      </FieldBlock>

      {metadata.pointsFieldId && (
        <FieldBlock label="Story Points" error={fieldErrors.points}>
          <PointsField
            value={item.points}
            onChange={(points) => update({ points })}
            defaults={defaults}
            className="h-9"
          />
        </FieldBlock>
      )}

      {metadata.supportsTimeTracking && (
        <FieldBlock label="Ước tính thời gian" error={fieldErrors.originalEstimate}>
          <EstimateField
            value={item.originalEstimate}
            onChange={(originalEstimate) => update({ originalEstimate })}
            defaults={defaults}
            className="h-9"
          />
        </FieldBlock>
      )}

      {metadata.supportsDueDate && (
        <FieldBlock label="Hạn hoàn thành" error={fieldErrors.dueDate}>
          <DueDateField
            value={item.dueDate}
            onChange={(dueDate) => update({ dueDate })}
            className="h-9"
          />
        </FieldBlock>
      )}

      {metadata.versionOptions.length > 0 && (
        <FieldBlock label="Phiên bản phát hành" error={fieldErrors.fixVersionIds}>
          <FixVersionField
            value={item.fixVersionIds}
            onChange={(fixVersionIds) => update({ fixVersionIds })}
            metadata={metadata}
            defaults={defaults}
            className="h-9"
          />
        </FieldBlock>
      )}

      <div className="space-y-1.5">
        <DescriptionEditor
          value={item.description}
          onChange={(description) => update({ description })}
          defaultDescription={defaults.description}
          showLayoutToggles={false}
        />
        {fieldErrors.description && (
          <p role="alert" className="text-2xs text-destructive">
            {fieldErrors.description}
          </p>
        )}
      </div>

      <DynamicCustomFields
        metadata={metadata}
        issueTypeId={item.issueTypeId}
        defaults={defaults}
        values={item.customFields}
        onChange={(customFields) => update({ customFields })}
      />
    </div>
  );
}
