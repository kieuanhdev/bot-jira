"use client";

import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/bulk/create-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssigneeCombobox } from "./assignee-combobox";
import { ParentCombobox } from "./parent-combobox";
import { LabelCombobox } from "./label-combobox";
import {
  ChevronUp,
  ExternalLink,
  RotateCcw,
  Sparkles,
  FileText,
} from "lucide-react";

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
  const subtaskIssueTypeIds = new Set(
    metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)
  );
  const isSubtask = item.issueTypeId ? subtaskIssueTypeIds.has(item.issueTypeId) : false;

  const descLength = item.description?.length ?? 0;

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
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
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

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Description & Notes (7 cols) */}
          <div className="lg:col-span-7 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                Mô tả chi tiết công việc (Description)
              </Label>
              <span
                className={`text-[10px] tabular-nums ${
                  descLength > MAX_DESCRIPTION_LENGTH * 0.9
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {descLength.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
              </span>
            </div>

            <Textarea
              placeholder="Nhập mô tả chi tiết, tài liệu tham khảo, tiêu chí nghiệm thu (AC)..."
              value={item.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              rows={6}
              className="w-full resize-y text-xs min-h-[140px] leading-relaxed bg-background"
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>Hỗ trợ văn bản thuần hoặc Markdown / Jira markup.</span>
              {item.description && defaults.description && (
                <button
                  type="button"
                  onClick={() => onChange({ description: undefined })}
                  className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  Dùng lại mô tả mặc định
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Key Attributes & Overrides (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Issue Type */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">
                Loại task <span className="text-destructive">*</span>
              </span>
              <Select
                value={item.issueTypeId || ""}
                onValueChange={(val) => {
                  const newType = val || undefined;
                  const isSub = newType ? subtaskIssueTypeIds.has(newType) : false;
                  const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
                  if (!isSub) patch.parent = null;
                  onChange(patch);
                }}
              >
                <SelectTrigger className="h-8 text-xs cursor-pointer">
                  <SelectValue
                    placeholder={
                      defaults.issueTypeId
                        ? `${metadata.issueTypes.find((t) => t.id === defaults.issueTypeId)?.name || "Mặc định"} (mặc định)`
                        : "Chọn loại task *"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {metadata.issueTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs cursor-pointer">
                      {t.subtask ? `⚡ ${t.name}` : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Parent (if subtask or has subtasks) */}
            {metadata.hasSubtaskTypes && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">
                  Task cha {isSubtask && <span className="text-destructive">*</span>}
                </span>
                <ParentCombobox
                  projectKey={projectKey}
                  value={item.parent}
                  onChange={(parent) => onChange({ parent })}
                  batchItems={allItems}
                  currentClientRef={item.clientRef}
                  subtaskIssueTypeIds={subtaskIssueTypeIds}
                  placeholder={isSubtask ? "Bắt buộc *" : "—"}
                  className="w-full"
                />
              </div>
            )}

            {/* Priority */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">Mức ưu tiên</span>
              <Select
                value={item.priorityId || ""}
                onValueChange={(val) => onChange({ priorityId: val || undefined })}
              >
                <SelectTrigger className="h-8 text-xs cursor-pointer">
                  <SelectValue
                    placeholder={
                      defaults.priorityId
                        ? `${metadata.priorityOptions.find((p) => p.id === defaults.priorityId)?.name || "Mặc định"} (mặc định)`
                        : "Mặc định"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {metadata.priorityOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs cursor-pointer">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">Người thực hiện</span>
              <AssigneeCombobox
                projectKey={projectKey}
                value={item.assignee ?? null}
                onChange={(username) => onChange({ assignee: username })}
                placeholder={defaults.assignee || "Chưa gán"}
              />
            </div>

            {/* Points */}
            {metadata.pointsFieldId && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">Story Points</span>
                <Input
                  type="number"
                  min="0"
                  placeholder={defaults.points != null ? String(defaults.points) : "—"}
                  value={item.points ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    onChange({ points: Number.isFinite(v) && v >= 0 ? v : undefined });
                  }}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Original Estimate */}
            {metadata.supportsTimeTracking && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">Ước tính (vd: 1d 4h)</span>
                <Input
                  placeholder={defaults.originalEstimate || "1d 2h"}
                  value={item.originalEstimate ?? ""}
                  onChange={(e) => onChange({ originalEstimate: e.target.value.trim() || undefined })}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Due Date */}
            {metadata.supportsDueDate && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">Hạn chót</span>
                <Input
                  type="date"
                  value={item.dueDate ?? ""}
                  onChange={(e) => onChange({ dueDate: e.target.value || undefined })}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* Fix Version */}
            {metadata.versionOptions.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">Phiên bản</span>
                <Select
                  value={item.fixVersionIds?.[0] || ""}
                  onValueChange={(val) => onChange({ fixVersionIds: val ? [val] : undefined })}
                >
                  <SelectTrigger className="h-8 text-xs cursor-pointer">
                    <SelectValue
                      placeholder={
                        defaults.fixVersionIds?.[0]
                          ? `${metadata.versionOptions.find((v) => v.id === defaults.fixVersionIds?.[0])?.name || "Mặc định"} (mặc định)`
                          : "Mặc định"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {metadata.versionOptions
                      .filter((v) => !v.archived)
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs cursor-pointer">
                          {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Labels (spans 2 cols) */}
            <div className="space-y-1 sm:col-span-2">
              <span className="text-[11px] font-medium text-foreground">Nhãn (Labels)</span>
              <LabelCombobox
                projectKey={projectKey}
                value={item.labels}
                onChange={(labels) => onChange({ labels })}
                placeholder={defaults.labels?.length ? defaults.labels.join(", ") : "Thêm nhãn..."}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
