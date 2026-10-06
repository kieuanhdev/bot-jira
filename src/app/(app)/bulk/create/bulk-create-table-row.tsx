"use client";

import React from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Copy,
  Settings2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssigneeCombobox } from "./assignee-combobox";
import { ParentCombobox } from "./parent-combobox";
import { LabelCombobox } from "./label-combobox";
import { ComponentsCombobox } from "./components-combobox";
import { type ColumnId } from "./lib/column-definitions";
import { type GridDensity } from "./lib/editor-preferences";
import { type RowValidationResult } from "./lib/client-validation";

export interface BulkCreateTableRowProps {
  item: BulkCreateRowInput;
  idx: number;
  rowVal?: RowValidationResult;
  isSelected: boolean;
  isExpanded: boolean;
  density: GridDensity;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  subtaskIssueTypeIds: Set<string>;
  effectiveIssueTypeName: { name: string; isInherited: boolean } | null;
  isColVisible: (colId: ColumnId) => boolean;
  onUpdateItem: (idx: number, patch: Partial<BulkCreateRowInput>) => void;
  onToggleSelection: (idx: number) => void;
  onPasteSummary: (e: React.ClipboardEvent<HTMLTextAreaElement>, rowIndex: number) => void;
  onAddRow: (afterIndex?: number) => void;
  onDuplicateRow: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onToggleExpand: (idx: number) => void;
  onOpenDetailSheet: (idx: number) => void;
}

export function BulkCreateTableRow({
  item,
  idx,
  rowVal,
  isSelected,
  isExpanded,
  density,
  metadata,
  projectKey,
  defaults,
  items,
  subtaskIssueTypeIds,
  effectiveIssueTypeName,
  isColVisible,
  onUpdateItem,
  onToggleSelection,
  onPasteSummary,
  onAddRow,
  onDuplicateRow,
  onDeleteRow,
  onToggleExpand,
  onOpenDetailSheet,
}: BulkCreateTableRowProps) {
  const hasErrors = (rowVal?.errors.length ?? 0) > 0;
  const stickyCellBg = isSelected
    ? "bg-primary/10 group-hover:bg-primary/15"
    : hasErrors
      ? "bg-destructive/10 group-hover:bg-destructive/15"
      : "bg-card group-hover:bg-muted/40";

  const inputHeight = density === "compact" ? "h-8" : "h-9";
  const cellPadding = density === "compact" ? "py-1.5 px-2" : "py-2.5 px-2.5";

  return (
    <tr
      data-row-index={idx}
      className={`group transition-colors ${
        isSelected
          ? "bg-primary/5 hover:bg-primary/10"
          : hasErrors
            ? "bg-destructive/5 hover:bg-destructive/10"
            : "hover:bg-muted/20"
      }`}
    >
      {/* Sticky Checkbox */}
      <td
        className={cn(
          "sticky left-0 z-10 px-2 py-2 text-center border-r border-border/40 transition-colors",
          stickyCellBg
        )}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelection(idx)}
          aria-label={`Chọn dòng ${idx + 1}`}
        />
      </td>

      {/* Sticky Index & Status */}
      <td
        className={cn(
          "sticky left-9 z-10 px-2 py-2 text-center font-mono text-[11px] border-r border-border/40 transition-colors",
          stickyCellBg
        )}
      >
        <div className="flex items-center justify-center gap-1">
          {hasErrors ? (
            <span title={rowVal?.errors[0].message}>
              <AlertCircle className="h-3 w-3 text-destructive" aria-hidden="true" />
            </span>
          ) : (
            <span className="text-muted-foreground">{idx + 1}</span>
          )}
        </div>
      </td>

      {/* Sticky Summary Input */}
      <td
        className={cn(
          "sticky left-[76px] z-10 px-3 py-2 border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors",
          stickyCellBg
        )}
      >
        <textarea
          data-field="summary"
          placeholder="Tiêu đề công việc..."
          value={item.summary}
          onChange={(e) => onUpdateItem(idx, { summary: e.target.value })}
          onPaste={(e) => onPasteSummary(e, idx)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onAddRow(idx);
            } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onDuplicateRow(idx);
            }
          }}
          rows={1}
          className={`flex w-full rounded-md border bg-background px-2.5 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[34px] max-h-[72px] resize-none overflow-y-auto transition-colors ${
            !item.summary.trim()
              ? "border-amber-500/40 bg-amber-500/5 focus-visible:ring-amber-500"
              : "border-input"
          }`}
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 72)}px`;
          }}
        />
      </td>

      {/* Issue Type */}
      {isColVisible("issueType") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Select
            value={item.issueTypeId || ""}
            onValueChange={(val) => {
              const newType = val || undefined;
              const isSub = newType ? subtaskIssueTypeIds.has(newType) : false;
              const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
              if (!isSub) patch.parent = null;
              onUpdateItem(idx, patch);
            }}
          >
            <SelectTrigger
              className={`${inputHeight} text-xs cursor-pointer ${
                !item.issueTypeId && !defaults.issueTypeId && !metadata.defaultIssueTypeId
                  ? "border-amber-500/40 bg-amber-500/5"
                  : item.issueTypeId
                    ? ""
                    : "text-muted-foreground"
              }`}
            >
              <SelectValue
                placeholder={effectiveIssueTypeName?.name || "Chọn loại task *"}
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
        </td>
      )}

      {/* Parent */}
      {isColVisible("parent") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <ParentCombobox
            projectKey={projectKey}
            value={item.parent}
            onChange={(parent) => onUpdateItem(idx, { parent })}
            batchItems={items}
            currentClientRef={item.clientRef}
            subtaskIssueTypeIds={subtaskIssueTypeIds}
            placeholder={
              item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId) ? "Bắt buộc *" : "—"
            }
            className="w-full"
          />
        </td>
      )}

      {/* Priority */}
      {isColVisible("priority") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Select
            value={item.priorityId || ""}
            onValueChange={(val) => onUpdateItem(idx, { priorityId: val || undefined })}
          >
            <SelectTrigger className={`${inputHeight} text-xs cursor-pointer`}>
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
        </td>
      )}

      {/* Assignee */}
      {isColVisible("assignee") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <AssigneeCombobox
            projectKey={projectKey}
            value={item.assignee ?? null}
            onChange={(username) => onUpdateItem(idx, { assignee: username })}
            placeholder={defaults.assignee || "Chưa gán"}
          />
        </td>
      )}

      {/* Components */}
      {isColVisible("components") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <ComponentsCombobox
            options={metadata.components || []}
            value={item.componentIds}
            onChange={(componentIds) => onUpdateItem(idx, { componentIds })}
            placeholder={
              defaults.componentIds && defaults.componentIds.length > 0
                ? (metadata.components ?? [])
                    .filter((c) => defaults.componentIds?.includes(c.id))
                    .map((c) => c.name)
                    .join(", ") || "—"
                : "—"
            }
            compact
          />
        </td>
      )}

      {/* Labels */}
      {isColVisible("labels") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <LabelCombobox
            projectKey={projectKey}
            value={item.labels}
            onChange={(labels) => onUpdateItem(idx, { labels })}
            placeholder={defaults.labels?.length ? defaults.labels.join(", ") : "Nhãn..."}
            compact
          />
        </td>
      )}

      {/* Points */}
      {isColVisible("points") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Input
            type="number"
            min="0"
            placeholder={defaults.points != null ? String(defaults.points) : "—"}
            value={item.points ?? ""}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onUpdateItem(idx, { points: Number.isFinite(v) && v >= 0 ? v : undefined });
            }}
            className={`${inputHeight} text-xs`}
          />
        </td>
      )}

      {/* Original Estimate */}
      {isColVisible("originalEstimate") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Input
            placeholder={defaults.originalEstimate || "1d 2h"}
            value={item.originalEstimate ?? ""}
            onChange={(e) =>
              onUpdateItem(idx, { originalEstimate: e.target.value.trim() || undefined })
            }
            className={`${inputHeight} text-xs`}
          />
        </td>
      )}

      {/* Due Date */}
      {isColVisible("dueDate") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Input
            type="date"
            value={item.dueDate ?? ""}
            onChange={(e) => onUpdateItem(idx, { dueDate: e.target.value || undefined })}
            className={`${inputHeight} text-xs`}
          />
        </td>
      )}

      {/* Fix Version */}
      {isColVisible("fixVersion") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <Select
            value={item.fixVersionIds?.[0] || ""}
            onValueChange={(val) =>
              onUpdateItem(idx, { fixVersionIds: val ? [val] : undefined })
            }
          >
            <SelectTrigger className={`${inputHeight} text-xs cursor-pointer`}>
              <SelectValue
                placeholder={
                  defaults.fixVersionIds?.[0]
                    ? metadata.versionOptions.find(
                        (v) => v.id === defaults.fixVersionIds?.[0]
                      )?.name || "Mặc định"
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
        </td>
      )}

      {/* Description inline */}
      {isColVisible("description") && (
        <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
          <textarea
            data-field="description"
            placeholder={
              defaults.description ? "Kế thừa mô tả mặc định..." : "Mô tả..."
            }
            value={item.description ?? ""}
            onChange={(e) =>
              onUpdateItem(idx, { description: e.target.value || undefined })
            }
            rows={1}
            className="flex w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs resize-none min-h-[32px] max-h-[72px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onFocus={(e) => {
              e.currentTarget.rows = 3;
            }}
            onBlur={(e) => {
              if (!e.currentTarget.value) e.currentTarget.rows = 1;
            }}
          />
        </td>
      )}

      {/* Sticky Right Actions */}
      <td
        className={cn(
          "sticky right-0 z-10 px-2 py-2 text-center border-l border-border shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors",
          stickyCellBg
        )}
      >
        <div className="flex items-center justify-center gap-1">
          {/* Toggle Expand Row Button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(idx)}
            title={isExpanded ? "Thu gọn chi tiết dòng" : "Mở rộng chi tiết dòng"}
            className={`h-7 w-7 p-0 cursor-pointer ${
              isExpanded
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>

          {/* Detail Sheet */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetailSheet(idx)}
            title="Mở form đầy đủ"
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-primary"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* Duplicate */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDuplicateRow(idx)}
            disabled={items.length >= MAX_BULK_CREATE_ITEMS}
            title="Nhân bản dòng (Ctrl+D)"
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          {/* Delete */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDeleteRow(idx)}
            disabled={items.length <= 1}
            title="Xoá dòng"
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
