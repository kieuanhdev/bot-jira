"use client";

import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AssigneeCombobox,
  ParentCombobox,
  LabelCombobox,
  DynamicCustomFields,
  IssueTypeField,
  PriorityField,
  FixVersionField,
  ComponentsField,
  PointsField,
  EstimateField,
  DueDateField,
  DescriptionEditor,
} from "@/components/task-fields";
import { FileText } from "lucide-react";

interface TaskDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: BulkCreateRowInput | null;
  defaults: BulkCreateFieldDefaults;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  items: BulkCreateRowInput[];
  onChange: (item: BulkCreateRowInput) => void;
}

export function TaskDetailSheet({
  open,
  onOpenChange,
  item,
  defaults,
  metadata,
  projectKey,
  items,
  onChange,
}: TaskDetailSheetProps) {
  if (!item) return null;

  const subtaskIssueTypeIds = new Set(
    metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)
  );

  function update(patch: Partial<BulkCreateRowInput>) {
    if (!item) return;
    onChange({ ...item, ...patch });
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Chi tiết task"
      description={item.summary || `Dòng: ${item.clientRef}`}
    >
      <div className="space-y-5">
        {/* Summary */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Tiêu đề <span className="text-destructive">*</span>
          </Label>
          <Input
            value={item.summary}
            onChange={(e) => update({ summary: e.target.value })}
            placeholder="Nhập tiêu đề công việc..."
            className="h-9 text-sm"
          />
        </div>

        {/* Issue Type — BC-SMART-301 */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Loại task <span className="text-destructive">*</span>
          </Label>
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
        </div>

        {/* Parent / Epic */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">
            Task cha / Epic
            {item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId) && (
              <span className="ml-1 text-destructive">*</span>
            )}
          </Label>
          <ParentCombobox
            projectKey={projectKey}
            value={item.parent}
            onChange={(parent) => update({ parent })}
            batchItems={items}
            currentClientRef={item.clientRef}
            subtaskIssueTypeIds={subtaskIssueTypeIds}
            placeholder={item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId) ? "Bắt buộc *" : "Chọn Epic / Task cha (tùy chọn)"}
          />
        </div>

        {/* Assignee */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Người thực hiện</Label>
          <AssigneeCombobox
            projectKey={projectKey}
            value={item.assignee ?? null}
            onChange={(username) => update({ assignee: username })}
            placeholder={defaults.assignee || "Chưa gán"}
          />
        </div>

        {/* Priority */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Mức ưu tiên</Label>
          <PriorityField
            value={item.priorityId}
            onChange={(priorityId) => update({ priorityId })}
            metadata={metadata}
            defaults={defaults}
            className="h-9"
          />
        </div>

        {/* Components */}
        {metadata.components && metadata.components.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Hợp phần (Components)</Label>
            <ComponentsField
              metadata={metadata}
              value={item.componentIds}
              onChange={(componentIds) => update({ componentIds })}
              defaults={defaults}
            />
          </div>
        )}

        {/* Labels */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-foreground">Nhãn</Label>
          <LabelCombobox
            projectKey={projectKey}
            value={item.labels}
            onChange={(labels) => update({ labels })}
            placeholder="Thêm nhãn…"
          />
        </div>

        {/* Story Points */}
        {metadata.pointsFieldId && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Story Points</Label>
            <PointsField
              value={item.points}
              onChange={(points) => update({ points })}
              defaults={defaults}
              className="h-9"
            />
          </div>
        )}

        {/* Original Estimate */}
        {metadata.supportsTimeTracking && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Ước tính thời gian</Label>
            <EstimateField
              value={item.originalEstimate}
              onChange={(originalEstimate) => update({ originalEstimate })}
              defaults={defaults}
              className="h-9"
            />
          </div>
        )}

        {/* Due Date */}
        {metadata.supportsDueDate && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Hạn hoàn thành</Label>
            <DueDateField
              value={item.dueDate}
              onChange={(dueDate) => update({ dueDate })}
              className="h-9"
            />
          </div>
        )}

        {/* Fix Version */}
        {metadata.versionOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Phiên bản phát hành</Label>
            <FixVersionField
              value={item.fixVersionIds}
              onChange={(fixVersionIds) => update({ fixVersionIds })}
              metadata={metadata}
              defaults={defaults}
              className="h-9"
            />
          </div>
        )}

        {/* Description — BC-SMART-302 */}
        <div className="space-y-1.5">
          <DescriptionEditor
            value={item.description}
            onChange={(description) => update({ description })}
            defaultDescription={defaults.description}
            showLayoutToggles={false}
          />
        </div>

        {/* Dynamic Custom Fields */}
        <DynamicCustomFields
          metadata={metadata}
          issueTypeId={item.issueTypeId}
          defaults={defaults}
          values={item.customFields}
          onChange={(customFields) => update({ customFields })}
        />

        {/* Client Ref (read-only) */}
        <div className="space-y-1.5 border-t border-border pt-3">
          <Label className="text-xs font-medium text-muted-foreground">Client Ref</Label>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {item.clientRef}
            </Badge>
            <FileText className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">Dùng để tham chiếu parent trong batch</span>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
