"use client";

import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/bulk/create-types";
import { Sheet } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
          <Select
            value={item.issueTypeId || ""}
            onValueChange={(val) => {
              const newType = val || undefined;
              const isSubtask = newType ? subtaskIssueTypeIds.has(newType) : false;
              const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
              if (!isSubtask) patch.parent = null;
              update(patch);
            }}
          >
            <SelectTrigger className={`h-9 text-xs cursor-pointer ${
              !item.issueTypeId && !defaults.issueTypeId && !metadata.defaultIssueTypeId
                ? "border-amber-500/40 bg-amber-500/5"
                : item.issueTypeId
                  ? ""
                  : "text-muted-foreground"
            }`}>
              <SelectValue placeholder={(() => {
                if (defaults.issueTypeId) {
                  const found = metadata.issueTypes.find((t) => t.id === defaults.issueTypeId);
                  return found ? `${found.subtask ? "⚡ " : ""}${found.name} (mặc định)` : "Chọn loại task *";
                }
                if (metadata.defaultIssueTypeId) {
                  const found = metadata.issueTypes.find((t) => t.id === metadata.defaultIssueTypeId);
                  return found ? `${found.subtask ? "⚡ " : ""}${found.name} (Jira mặc định)` : "Chọn loại task *";
                }
                return "Chọn loại task *";
              })()} />
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

        {/* Parent */}
        {metadata.hasSubtaskTypes && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              Parent
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
              placeholder={item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId) ? "Bắt buộc *" : "Không có parent"}
            />
          </div>
        )}

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
          <Select
            value={item.priorityId || ""}
            onValueChange={(val) => update({ priorityId: val || undefined })}
          >
            <SelectTrigger className="h-9 text-xs cursor-pointer">
              <SelectValue placeholder={defaults.priorityId ? metadata.priorityOptions.find((p) => p.id === defaults.priorityId)?.name || "Mặc định" : "Mặc định"} />
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
            <Input
              type="number"
              min="0"
              step="1"
              placeholder={defaults.points != null ? String(defaults.points) : "—"}
              value={item.points ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                update({ points: Number.isFinite(v) && v >= 0 ? v : undefined });
              }}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Original Estimate */}
        {metadata.supportsTimeTracking && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Ước tính thời gian</Label>
            <Input
              placeholder={defaults.originalEstimate || "vd: 1d 4h"}
              value={item.originalEstimate ?? ""}
              onChange={(e) => update({ originalEstimate: e.target.value.trim() || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Due Date */}
        {metadata.supportsDueDate && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Hạn hoàn thành</Label>
            <Input
              type="date"
              value={item.dueDate ?? ""}
              onChange={(e) => update({ dueDate: e.target.value || undefined })}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* Fix Version */}
        {metadata.versionOptions.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Phiên bản phát hành</Label>
            <Select
              value={item.fixVersionIds?.[0] || ""}
              onValueChange={(val) => update({ fixVersionIds: val ? [val] : undefined })}
            >
              <SelectTrigger className="h-9 text-xs cursor-pointer">
                <SelectValue placeholder={defaults.fixVersionIds?.[0] ? metadata.versionOptions.find((v) => v.id === defaults.fixVersionIds?.[0])?.name || "Mặc định" : "Mặc định"} />
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

        {/* Description — BC-SMART-302: taller area with char counter */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium text-foreground">Mô tả</Label>
            <span className={`text-[10px] tabular-nums ${
              (item.description?.length ?? 0) > MAX_DESCRIPTION_LENGTH * 0.9
                ? "text-destructive font-medium"
                : "text-muted-foreground"
            }`}>
              {item.description?.length ?? 0} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
            </span>
          </div>
          <Textarea
            placeholder="Mô tả chi tiết công việc..."
            rows={8}
            value={item.description ?? ""}
            onChange={(e) => update({ description: e.target.value || undefined })}
            className="resize-y text-sm min-h-[240px]"
          />
        </div>

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
