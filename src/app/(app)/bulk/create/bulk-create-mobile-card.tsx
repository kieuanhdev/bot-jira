"use client";

import React from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { ExpandedRowEditor } from "./expanded-row-editor";
import { type RowValidationResult } from "./lib/client-validation";

export interface BulkCreateMobileCardProps {
  item: BulkCreateRowInput;
  idx: number;
  rowVal?: RowValidationResult;
  isSelected: boolean;
  isExpanded: boolean;
  itemsLength: number;
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  allItems: BulkCreateRowInput[];
  subtaskIssueTypeIds: Set<string>;
  effectiveIssueTypeName: { name: string; isInherited: boolean } | null;
  onUpdateItem: (idx: number, patch: Partial<BulkCreateRowInput>) => void;
  onToggleSelection: (idx: number) => void;
  onPasteSummary: (e: React.ClipboardEvent<HTMLTextAreaElement>, rowIndex: number) => void;
  onDuplicateRow: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onToggleExpand: (idx: number) => void;
  onOpenDetailSheet: (idx: number) => void;
}

export function BulkCreateMobileCard({
  item,
  idx,
  rowVal,
  isSelected,
  isExpanded,
  itemsLength,
  metadata,
  projectKey,
  defaults,
  allItems,
  subtaskIssueTypeIds,
  effectiveIssueTypeName,
  onUpdateItem,
  onToggleSelection,
  onPasteSummary,
  onDuplicateRow,
  onDeleteRow,
  onToggleExpand,
  onOpenDetailSheet,
}: BulkCreateMobileCardProps) {
  const hasErrors = (rowVal?.errors.length ?? 0) > 0;

  return (
    <div
      data-row-index={idx}
      className={`rounded-lg border bg-card p-3.5 space-y-3 transition-colors ${
        isSelected
          ? "border-primary/50 bg-primary/5"
          : hasErrors
            ? "border-destructive/40 bg-destructive/5"
            : "border-border shadow-2xs"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelection(idx)}
            aria-label={`Chọn dòng ${idx + 1}`}
          />
          <span className="font-mono text-xs font-semibold text-muted-foreground">
            #{idx + 1}
          </span>
          {hasErrors && (
            <Badge variant="danger" className="text-[10px] py-0 px-1.5 h-4">
              {rowVal?.errors[0].message}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(idx)}
            className="h-7 px-2 text-xs cursor-pointer text-muted-foreground hover:text-primary"
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            <span className="text-[11px] ml-1">Mô tả</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenDetailSheet(idx)}
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDuplicateRow(idx)}
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDeleteRow(idx)}
            disabled={itemsLength <= 1}
            className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div>
        <textarea
          data-field="summary"
          placeholder="Tiêu đề công việc (Summary) *"
          value={item.summary}
          onChange={(e) => onUpdateItem(idx, { summary: e.target.value })}
          onPaste={(e) => onPasteSummary(e, idx)}
          rows={1}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs resize-none min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
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
            <SelectTrigger className="h-8 text-xs cursor-pointer">
              <SelectValue
                placeholder={effectiveIssueTypeName?.name || "Loại task *"}
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

        <div>
          <Select
            value={item.priorityId || ""}
            onValueChange={(val) => onUpdateItem(idx, { priorityId: val || undefined })}
          >
            <SelectTrigger className="h-8 text-xs cursor-pointer">
              <SelectValue placeholder={defaults.priorityId || "Ưu tiên"} />
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
      </div>

      {isExpanded && (
        <ExpandedRowEditor
          item={item}
          rowIndex={idx}
          defaults={defaults}
          metadata={metadata}
          projectKey={projectKey}
          allItems={allItems}
          onChange={(patch) => onUpdateItem(idx, patch)}
          onCollapse={() => onToggleExpand(idx)}
          onOpenFullSheet={() => onOpenDetailSheet(idx)}
        />
      )}
    </div>
  );
}
