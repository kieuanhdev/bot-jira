"use client";

import {
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_DESCRIPTION_LENGTH,
} from "@/lib/bulk/create-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssigneeCombobox } from "./assignee-combobox";
import { LabelCombobox } from "./label-combobox";
import { SlidersHorizontal, RotateCcw, Check } from "lucide-react";

interface BulkCreateDefaultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  onChange: (updated: BulkCreateFieldDefaults) => void;
}

export function BulkCreateDefaultsDialog({
  open,
  onOpenChange,
  metadata,
  projectKey,
  defaults,
  onChange,
}: BulkCreateDefaultsDialogProps) {
  function updateField<K extends keyof BulkCreateFieldDefaults>(
    key: K,
    val: BulkCreateFieldDefaults[K]
  ) {
    onChange({ ...defaults, [key]: val });
  }

  function handleReset() {
    onChange({});
  }

  const activeCount = [
    defaults.issueTypeId,
    defaults.assignee,
    defaults.priorityId,
    defaults.labels?.length ? true : null,
    defaults.points != null ? true : null,
    defaults.originalEstimate,
    defaults.dueDate,
    defaults.fixVersionIds?.length ? true : null,
    defaults.description,
  ].filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <SlidersHorizontal className="h-5 w-5 text-primary" aria-hidden="true" />
              Giá trị mặc định cho toàn bộ batch ({projectKey})
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Các giá trị này sẽ tự động áp dụng cho mọi task chưa có giá trị riêng. Bạn vẫn có thể ghi đè từng dòng bất cứ lúc nào.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Issue Type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Loại task mặc định</Label>
              <Select
                value={defaults.issueTypeId || ""}
                onValueChange={(val) => updateField("issueTypeId", val || undefined)}
              >
                <SelectTrigger className="h-9 text-xs cursor-pointer">
                  <SelectValue placeholder="Chọn loại task mặc định" />
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

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Mức ưu tiên mặc định</Label>
              <Select
                value={defaults.priorityId || ""}
                onValueChange={(val) => updateField("priorityId", val || undefined)}
              >
                <SelectTrigger className="h-9 text-xs cursor-pointer">
                  <SelectValue placeholder="Chọn mức ưu tiên mặc định" />
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Người thực hiện mặc định</Label>
              <AssigneeCombobox
                projectKey={projectKey}
                value={defaults.assignee ?? null}
                onChange={(username) => updateField("assignee", username)}
                placeholder="Chọn người thực hiện mặc định..."
              />
            </div>

            {/* Story points */}
            {metadata.pointsFieldId && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Story Points mặc định</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="vd: 3"
                  value={defaults.points ?? ""}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    updateField("points", Number.isFinite(v) && v >= 0 ? v : undefined);
                  }}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Estimate */}
            {metadata.supportsTimeTracking && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Ước tính thời gian mặc định</Label>
                <Input
                  placeholder="vd: 2d 4h"
                  value={defaults.originalEstimate ?? ""}
                  onChange={(e) => updateField("originalEstimate", e.target.value.trim() || undefined)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Due date */}
            {metadata.supportsDueDate && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Hạn chót mặc định</Label>
                <Input
                  type="date"
                  value={defaults.dueDate ?? ""}
                  onChange={(e) => updateField("dueDate", e.target.value || undefined)}
                  className="h-9 text-xs"
                />
              </div>
            )}

            {/* Fix Version */}
            {metadata.versionOptions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Phiên bản phát hành</Label>
                <Select
                  value={defaults.fixVersionIds?.[0] || ""}
                  onValueChange={(val) => updateField("fixVersionIds", val ? [val] : undefined)}
                >
                  <SelectTrigger className="h-9 text-xs cursor-pointer">
                    <SelectValue placeholder="Chọn phiên bản mặc định" />
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

            {/* Labels */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-foreground">Nhãn mặc định</Label>
              <LabelCombobox
                projectKey={projectKey}
                value={defaults.labels}
                onChange={(labels) => updateField("labels", labels)}
                placeholder="Thêm nhãn mặc định..."
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-foreground">Mô tả mẫu mặc định</Label>
                <span className="text-[10px] text-muted-foreground">
                  {defaults.description?.length ?? 0} / {MAX_DESCRIPTION_LENGTH}
                </span>
              </div>
              <Textarea
                placeholder="Mô tả mặc định hoặc template nội dung công việc..."
                rows={6}
                value={defaults.description ?? ""}
                onChange={(e) => updateField("description", e.target.value || undefined)}
                className="text-xs resize-y min-h-[140px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={activeCount === 0}
            className="text-xs text-muted-foreground hover:text-destructive cursor-pointer gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Xoá toàn bộ mặc định
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-semibold cursor-pointer gap-1.5"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Xác nhận ({activeCount} trường đã đặt)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
