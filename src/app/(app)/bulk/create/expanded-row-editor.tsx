"use client";

import { useState } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
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
import { ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExpandedRowEditorProps {
  item: BulkCreateRowInput;
  rowIndex: number;
  defaults: BulkCreateFieldDefaults;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  allItems: BulkCreateRowInput[];
  onChange: (patch: Partial<BulkCreateRowInput>) => void;
  onCollapse: () => void;
  onOpenFullSheet: () => void;
}

export function ExpandedRowEditor({
  item,
  rowIndex,
  defaults,
  metadata,
  projectKey,
  allItems,
  onChange,
  onCollapse,
  onOpenFullSheet,
}: ExpandedRowEditorProps) {
  const [isLargeHeight, setIsLargeHeight] = useState(false);
  const [isFullWidth, setIsFullWidth] = useState(false);

  const subtaskIssueTypeIds = new Set(
    metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)
  );
  const isSubtask = item.issueTypeId ? subtaskIssueTypeIds.has(item.issueTypeId) : false;

  return (
    <div className="border-t border-border/80 bg-muted/15 p-4 rounded-b-lg shadow-inner">
      <div className="flex flex-col gap-4">
        {/* Expanded Row Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-primary">
              #{rowIndex + 1}
            </span>
            <span className="text-xs font-semibold text-foreground">
              {item.summary ? item.summary : `Chi tiết công việc (${item.clientRef})`}
            </span>
            <Badge variant="outline" className="font-mono text-2xs text-muted-foreground">
              {item.clientRef}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenFullSheet}
              className="h-7 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              Mở form đầy đủ
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCollapse}
              className="h-7 text-xs gap-1 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              Thu gọn
            </Button>
          </div>
        </div>

        {/* Layout Grid: Supports Side-by-Side (8/4 cols) or Full-Width (12 cols) */}
        <div className={cn("grid gap-5", isFullWidth ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12")}>
          {/* Description Section */}
          <div className={cn("space-y-2", isFullWidth ? "col-span-1" : "lg:col-span-8")}>
            <DescriptionEditor
              value={item.description}
              onChange={(description) => onChange({ description })}
              defaultDescription={defaults.description}
              isLargeHeight={isLargeHeight}
              onToggleHeight={() => setIsLargeHeight(!isLargeHeight)}
              isFullWidth={isFullWidth}
              onToggleFullWidth={() => setIsFullWidth(!isFullWidth)}
            />
          </div>

          {/* Key Attributes & Overrides Column */}
          <div className={cn("grid gap-3 text-xs", isFullWidth ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 pt-2 border-t border-border/60" : "lg:col-span-4 grid-cols-1 sm:grid-cols-2")}>
            {/* Issue Type */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">
                Loại task <span className="text-destructive">*</span>
              </span>
              <IssueTypeField
                value={item.issueTypeId}
                onChange={(newType) => {
                  const isEpic = newType
                    ? metadata.issueTypes.find((t) => t.id === newType)?.name.toLowerCase() === "epic"
                    : false;
                  const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
                  if (isEpic) patch.parent = null;
                  onChange(patch);
                }}
                metadata={metadata}
                defaults={defaults}
              />
            </div>

            {/* Parent / Epic */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">
                Task cha / Epic {isSubtask && <span className="text-destructive">*</span>}
              </span>
              <ParentCombobox
                projectKey={projectKey}
                value={item.parent}
                onChange={(parent) => onChange({ parent })}
                batchItems={allItems}
                currentClientRef={item.clientRef}
                subtaskIssueTypeIds={subtaskIssueTypeIds}
                placeholder={isSubtask ? "Bắt buộc *" : "Chọn Epic / Task cha (tùy chọn)"}
                className="w-full"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">Mức ưu tiên</span>
              <PriorityField
                value={item.priorityId}
                onChange={(priorityId) => onChange({ priorityId })}
                metadata={metadata}
                defaults={defaults}
              />
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-foreground">Người thực hiện</span>
              <AssigneeCombobox
                projectKey={projectKey}
                value={item.assignee ?? null}
                onChange={(username) => onChange({ assignee: username })}
                placeholder={defaults.assignee || "Chưa gán"}
              />
            </div>

            {/* Components */}
            {metadata.components && metadata.components.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-foreground">Hợp phần (Components)</span>
                <ComponentsField
                  metadata={metadata}
                  value={item.componentIds}
                  onChange={(componentIds) => onChange({ componentIds })}
                  defaults={defaults}
                  compact={true}
                />
              </div>
            )}

            {/* Points */}
            {metadata.pointsFieldId && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-foreground">Story Points</span>
                <PointsField
                  value={item.points}
                  onChange={(points) => onChange({ points })}
                  defaults={defaults}
                />
              </div>
            )}

            {/* Original Estimate */}
            {metadata.supportsTimeTracking && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-foreground">Ước tính (vd: 1d 4h)</span>
                <EstimateField
                  value={item.originalEstimate}
                  onChange={(originalEstimate) => onChange({ originalEstimate })}
                  defaults={defaults}
                />
              </div>
            )}

            {/* Due Date */}
            {metadata.supportsDueDate && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-foreground">Hạn chót</span>
                <DueDateField
                  value={item.dueDate}
                  onChange={(dueDate) => onChange({ dueDate })}
                />
              </div>
            )}

            {/* Fix Version */}
            {metadata.versionOptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-foreground">Phiên bản</span>
                <FixVersionField
                  value={item.fixVersionIds}
                  onChange={(fixVersionIds) => onChange({ fixVersionIds })}
                  metadata={metadata}
                  defaults={defaults}
                />
              </div>
            )}

            {/* Labels */}
            <div className={cn("space-y-1", isFullWidth ? "col-span-2 sm:col-span-4" : "sm:col-span-2")}>
              <span className="text-xs font-medium text-foreground">Nhãn (Labels)</span>
              <LabelCombobox
                projectKey={projectKey}
                value={item.labels}
                onChange={(labels) => onChange({ labels })}
                placeholder={defaults.labels?.length ? defaults.labels.join(", ") : "Thêm nhãn..."}
                compact
              />
            </div>

            {/* Dynamic Custom Fields */}
            <div className={cn(isFullWidth ? "col-span-2 sm:col-span-4" : "sm:col-span-2")}>
              <DynamicCustomFields
                metadata={metadata}
                issueTypeId={item.issueTypeId}
                defaults={defaults}
                values={item.customFields}
                onChange={(customFields) => onChange({ customFields })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
