"use client";

import { useState } from "react";
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
import { ComponentsCombobox } from "./components-combobox";
import { DynamicCustomFields } from "./dynamic-custom-fields";
import {
  ChevronUp,
  ExternalLink,
  RotateCcw,
  FileText,
  Maximize2,
  Minimize2,
  Columns,
  Square,
  ListChecks,
  Code,
} from "lucide-react";
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

  const descLength = item.description?.length ?? 0;

  function insertTemplate(templateText: string) {
    const current = item.description || "";
    const updated = current ? `${current}\n\n${templateText}` : templateText;
    onChange({ description: updated });
  }

  function handleInsertAcTemplate() {
    insertTemplate(
`*Mục tiêu:* 

*Tiêu chí nghiệm thu (Acceptance Criteria):*
- [ ] 
- [ ] 

*Tài liệu tham khảo & Ghi chú:*
`
    );
  }

  function handleInsertCodeBlock() {
    insertTemplate(
`{code:typescript}
// Mã nguồn hoặc log lỗi ở đây
{code}`
    );
  }

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

        {/* Layout Grid: Supports Side-by-Side (8/4 cols) or Full-Width (12 cols) */}
        <div className={cn("grid gap-5", isFullWidth ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-12")}>
          {/* Description Section */}
          <div className={cn("space-y-2", isFullWidth ? "col-span-1" : "lg:col-span-8")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>Mô tả chi tiết công việc (Description)</span>
              </Label>

              {/* Description Toolbar: Templates, Size and Layout toggles */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleInsertAcTemplate}
                  title="Chèn khung Tiêu chí nghiệm thu (Acceptance Criteria)"
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <ListChecks className="h-3 w-3 text-primary" aria-hidden="true" />
                  <span>+ Mẫu AC</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleInsertCodeBlock}
                  title="Chèn khối mã nguồn {code}"
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  <Code className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span>+ Code</span>
                </Button>

                <div className="h-3.5 w-px bg-border/80 hidden sm:block" aria-hidden="true" />

                {/* Toggle Height */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsLargeHeight(!isLargeHeight)}
                  title={isLargeHeight ? "Thu nhỏ chiều cao (300px)" : "Mở rộng chiều cao (480px)"}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {isLargeHeight ? (
                    <>
                      <Minimize2 className="h-3 w-3" aria-hidden="true" />
                      <span>Thu cao</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="h-3 w-3" aria-hidden="true" />
                      <span>Kéo to</span>
                    </>
                  )}
                </Button>

                {/* Toggle Layout (Full Width vs 2 Columns) */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullWidth(!isFullWidth)}
                  title={isFullWidth ? "Chuyển về chia 2 cột" : "Mở rộng mô tả toàn chiều rộng"}
                  className="h-6 px-2 text-[11px] gap-1 cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {isFullWidth ? (
                    <>
                      <Columns className="h-3 w-3" aria-hidden="true" />
                      <span>2 Cột</span>
                    </>
                  ) : (
                    <>
                      <Square className="h-3 w-3" aria-hidden="true" />
                      <span>Toàn rộng</span>
                    </>
                  )}
                </Button>

                <span
                  className={cn(
                    "text-[10px] tabular-nums ml-1",
                    descLength > MAX_DESCRIPTION_LENGTH * 0.9
                      ? "text-destructive font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  {descLength.toLocaleString()} / {MAX_DESCRIPTION_LENGTH.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Generous Textarea with Smooth Resizing */}
            <Textarea
              placeholder="Nhập mô tả chi tiết, tài liệu tham khảo, tiêu chí nghiệm thu (AC)... Hỗ trợ định dạng văn bản thuần, Markdown hoặc Jira markup."
              value={item.description ?? ""}
              onChange={(e) => onChange({ description: e.target.value || undefined })}
              rows={isLargeHeight ? 18 : 11}
              className={cn(
                "w-full resize-y text-xs leading-relaxed bg-background transition-all duration-200 border-border/80 focus-visible:ring-1 focus-visible:ring-ring font-sans shadow-2xs",
                isLargeHeight ? "min-h-[480px]" : "min-h-[280px]"
              )}
            />

            <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground pt-1 gap-2">
              <span className="flex items-center gap-1">
                <span>Hỗ trợ Markdown và Jira markup (h1., *bold*, _italic_, - [ ], {"{code}"}). Kéo góc dưới ô để mở rộng tuỳ ý.</span>
              </span>
              {item.description && defaults.description && (
                <button
                  type="button"
                  onClick={() => onChange({ description: undefined })}
                  className="text-primary hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RotateCcw className="h-3 w-3" />
                  Dùng lại mô tả mặc định
                </button>
              )}
            </div>
          </div>

          {/* Key Attributes & Overrides Column */}
          <div className={cn("grid gap-3 text-xs", isFullWidth ? "grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 pt-2 border-t border-border/60" : "lg:col-span-4 grid-cols-1 sm:grid-cols-2")}>
            {/* Issue Type */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">
                Loại task <span className="text-destructive">*</span>
              </span>
              <Select
                value={item.issueTypeId || ""}
                onValueChange={(val) => {
                  const newType = val || undefined;
                  const isEpic = newType ? metadata.issueTypes.find((t) => t.id === newType)?.name.toLowerCase() === "epic" : false;
                  const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
                  if (isEpic) patch.parent = null;
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

            {/* Parent / Epic */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-foreground">
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

            {/* Components */}
            {metadata.components && metadata.components.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-foreground">Hợp phần (Components)</span>
                <ComponentsCombobox
                  options={metadata.components}
                  value={item.componentIds}
                  onChange={(componentIds) => onChange({ componentIds })}
                  placeholder={
                    defaults.componentIds && defaults.componentIds.length > 0
                      ? metadata.components
                          .filter((c) => defaults.componentIds!.includes(c.id))
                          .map((c) => c.name)
                          .join(", ") + " (mặc định)"
                      : "Chọn hợp phần…"
                  }
                  compact={true}
                />
              </div>
            )}

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

            {/* Labels */}
            <div className={cn("space-y-1", isFullWidth ? "col-span-2 sm:col-span-4" : "sm:col-span-2")}>
              <span className="text-[11px] font-medium text-foreground">Nhãn (Labels)</span>
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
