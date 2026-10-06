"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Plus,
  Trash2,
  Copy,
  Settings2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AssigneeCombobox } from "./assignee-combobox";
import { ParentCombobox } from "./parent-combobox";
import { LabelCombobox } from "./label-combobox";
import { ComponentsCombobox } from "./components-combobox";
import { ExpandedRowEditor } from "./expanded-row-editor";
import { TaskDetailSheet } from "./task-detail-sheet";
import { BulkSelectionToolbar } from "./bulk-selection-toolbar";
import { type ColumnId, ALL_COLUMNS } from "./lib/column-definitions";
import { type GridDensity } from "./lib/editor-preferences";
import { parsePastedSpreadsheet } from "./lib/paste-matrix";
import { validateAllRows, type RowValidationResult } from "./lib/client-validation";
import {
  generateUniqueClientRef,
  filterBlankPlaceholderItems,
} from "@/lib/bulk/client-ref";

interface BulkCreateDataGridProps {
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  onChange: (updated: BulkCreateRowInput[]) => void;
  visibleColumnIds: string[];
  density: GridDensity;
  focusRow?: number | null;
  focusField?: string | null;
  onClearFocusRow?: () => void;
  selectedRows: Set<number>;
  onSelectedRowsChange: (selected: Set<number>) => void;
}

export function BulkCreateDataGrid({
  metadata,
  projectKey,
  defaults,
  items,
  onChange,
  visibleColumnIds,
  density,
  focusRow,
  focusField,
  onClearFocusRow,
  selectedRows,
  onSelectedRowsChange,
}: BulkCreateDataGridProps) {
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [detailSheetIndex, setDetailSheetIndex] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const subtaskIssueTypeIds = useMemo(
    () => new Set(metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)),
    [metadata.issueTypes]
  );

  // Validate all rows
  const validationSummary = useMemo(
    () => validateAllRows(items, defaults, metadata),
    [items, defaults, metadata]
  );

  const validationMap = useMemo(() => {
    const map = new Map<number, RowValidationResult>();
    validationSummary.rowResults.forEach((r) => map.set(r.rowIndex, r));
    return map;
  }, [validationSummary]);

  // Handle focusRow and focusField from outside (e.g. from Preview back-to-fix)
  useEffect(() => {
    if (focusRow != null && focusRow >= 0 && focusRow < items.length) {
      const target = focusRow;
      const targetRowElem = tableRef.current?.querySelector(`[data-row-index="${target}"]`);
      targetRowElem?.scrollIntoView({ behavior: "smooth", block: "center" });

      if (focusField === "description") {
        setExpandedRowIndex(target);
      } else {
        const inputElem = targetRowElem?.querySelector(`[data-field="${focusField || "summary"}"]`) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLButtonElement
          | null;
        inputElem?.focus();
      }

      onClearFocusRow?.();
    }
  }, [focusRow, focusField, items.length, onClearFocusRow]);

  const visibleColumns = useMemo(() => {
    return ALL_COLUMNS.filter((col) => {
      if (!col.isAvailable(metadata)) return false;
      if (!col.canToggle) return true;
      return visibleColumnIds.includes(col.id);
    });
  }, [metadata, visibleColumnIds]);

  const isColVisible = useCallback(
    (colId: ColumnId) => visibleColumns.some((c) => c.id === colId),
    [visibleColumns]
  );

  function updateItem(idx: number, patch: Partial<BulkCreateRowInput>) {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function handleAddRow(afterIndex?: number) {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;
    const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
    const newRef = generateUniqueClientRef(existingRefs, "row");
    const newRow: BulkCreateRowInput = {
      clientRef: newRef,
      summary: "",
    };

    if (afterIndex != null && afterIndex >= 0 && afterIndex < items.length) {
      const next = [...items];
      next.splice(afterIndex + 1, 0, newRow);
      onChange(next);
      setTimeout(() => {
        const rowElem = tableRef.current?.querySelector(`[data-row-index="${afterIndex + 1}"]`);
        const summaryInput = rowElem?.querySelector('textarea[data-field="summary"]') as HTMLTextAreaElement | null;
        summaryInput?.focus();
      }, 50);
    } else {
      onChange([...items, newRow]);
    }
  }

  function handleAddFiveRows() {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;
    const count = Math.min(5, MAX_BULK_CREATE_ITEMS - items.length);
    const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
    const newRows: BulkCreateRowInput[] = [];
    for (let k = 0; k < count; k++) {
      const newRef = generateUniqueClientRef(existingRefs, "row");
      existingRefs.add(newRef);
      newRows.push({ clientRef: newRef, summary: "" });
    }
    const nonBlank = filterBlankPlaceholderItems(items);
    onChange([...nonBlank, ...newRows]);
  }

  function handleDuplicateRow(idx: number) {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;
    const target = items[idx];
    if (!target) return;
    const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
    const newRef = generateUniqueClientRef(existingRefs, target.clientRef || "row");
    const duplicated: BulkCreateRowInput = {
      ...target,
      clientRef: newRef,
      summary: target.summary ? `${target.summary} (bản sao)` : "",
    };
    const next = [...items];
    next.splice(idx + 1, 0, duplicated);
    onChange(next);
  }

  function handleDeleteRow(idx: number) {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : [{ clientRef: "row-1", summary: "" }]);
    if (expandedRowIndex === idx) setExpandedRowIndex(null);
  }

  function toggleRowSelection(idx: number) {
    const next = new Set(selectedRows);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    onSelectedRowsChange(next);
  }

  function toggleSelectAll() {
    if (selectedRows.size === items.length) {
      onSelectedRowsChange(new Set());
    } else {
      onSelectedRowsChange(new Set(items.map((_, i) => i)));
    }
  }

  function handleBulkApply(indices: Set<number>, patch: Partial<BulkCreateRowInput>) {
    const next = [...items];
    for (const idx of indices) {
      if (next[idx]) {
        if (patch.parent) {
          const isEpic = metadata.issueTypes.find((t) => t.id === next[idx].issueTypeId)?.name.toLowerCase() === "epic";
          if (isEpic) continue;
        }
        next[idx] = { ...next[idx], ...patch };
      }
    }
    onChange(next);
    onSelectedRowsChange(new Set());
  }

  function handleBulkDelete(indices: Set<number>) {
    const remaining = items.filter((_, i) => !indices.has(i));
    onChange(remaining.length > 0 ? remaining : [{ clientRef: "row-1", summary: "" }]);
    onSelectedRowsChange(new Set());
    setExpandedRowIndex(null);
  }

  function handleClearOverrides(indices: Set<number>) {
    const next = [...items];
    for (const idx of indices) {
      if (next[idx]) {
        next[idx] = { clientRef: next[idx].clientRef!, summary: next[idx].summary };
      }
    }
    onChange(next);
    onSelectedRowsChange(new Set());
  }

  function handlePasteOnSummary(e: React.ClipboardEvent<HTMLTextAreaElement>, rowIndex: number) {
    const clipboardText = e.clipboardData.getData("text");
    const pasteResult = parsePastedSpreadsheet(clipboardText, rowIndex, items, metadata);
    if (pasteResult) {
      e.preventDefault();
      onChange(pasteResult.items);
    }
  }

  const getEffectiveIssueTypeName = useCallback(
    (row: BulkCreateRowInput): { name: string; isInherited: boolean } | null => {
      if (row.issueTypeId) {
        const found = metadata.issueTypes.find((t) => t.id === row.issueTypeId);
        return found ? { name: found.subtask ? `⚡ ${found.name}` : found.name, isInherited: false } : null;
      }
      if (defaults.issueTypeId) {
        const found = metadata.issueTypes.find((t) => t.id === defaults.issueTypeId);
        return found
          ? { name: found.subtask ? `⚡ ${found.name} (mặc định)` : `${found.name} (mặc định)`, isInherited: true }
          : null;
      }
      if (metadata.defaultIssueTypeId) {
        const found = metadata.issueTypes.find((t) => t.id === metadata.defaultIssueTypeId);
        return found
          ? { name: found.subtask ? `⚡ ${found.name} (Jira mặc định)` : `${found.name} (Jira mặc định)`, isInherited: true }
          : null;
      }
      return null;
    },
    [metadata, defaults.issueTypeId]
  );

  const inputHeight = density === "compact" ? "h-8" : "h-9";
  const cellPadding = density === "compact" ? "py-1.5 px-2" : "py-2.5 px-2.5";

  return (
    <div ref={tableRef} className="flex-1 flex flex-col min-h-0 space-y-2">
      {/* Contextual Bulk Selection Toolbar */}
      {selectedRows.size > 0 && (
        <div className="shrink-0 px-4 pt-2">
          <BulkSelectionToolbar
            selectedCount={selectedRows.size}
            totalItems={items.length}
            metadata={metadata}
            projectKey={projectKey}
            selectedIndices={selectedRows}
            batchItems={items}
            onApply={handleBulkApply}
            onDelete={handleBulkDelete}
            onClearOverrides={handleClearOverrides}
            onClearSelection={() => onSelectedRowsChange(new Set())}
          />
        </div>
      )}

      {/* Mobile Card View (< md) */}
      <div className="block md:hidden flex-1 overflow-y-auto px-4 py-2 space-y-3">
        {items.map((item, idx) => {
          const rowVal = validationMap.get(idx);
          const hasErrors = (rowVal?.errors.length ?? 0) > 0;
          const isSelected = selectedRows.has(idx);

          return (
            <div
              key={item.clientRef || idx}
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
                    onCheckedChange={() => toggleRowSelection(idx)}
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
                    onClick={() => setExpandedRowIndex(expandedRowIndex === idx ? null : idx)}
                    className="h-7 px-2 text-xs cursor-pointer text-muted-foreground hover:text-primary"
                  >
                    {expandedRowIndex === idx ? (
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
                    onClick={() => setDetailSheetIndex(idx)}
                    className="h-7 w-7 p-0 cursor-pointer text-muted-foreground"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDuplicateRow(idx)}
                    className="h-7 w-7 p-0 cursor-pointer text-muted-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteRow(idx)}
                    disabled={items.length <= 1}
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
                  onChange={(e) => updateItem(idx, { summary: e.target.value })}
                  onPaste={(e) => handlePasteOnSummary(e, idx)}
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
                      updateItem(idx, patch);
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs cursor-pointer">
                      <SelectValue placeholder={getEffectiveIssueTypeName(item)?.name || "Loại task *"} />
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
                    onValueChange={(val) => updateItem(idx, { priorityId: val || undefined })}
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

              {expandedRowIndex === idx && (
                <ExpandedRowEditor
                  item={item}
                  rowIndex={idx}
                  defaults={defaults}
                  metadata={metadata}
                  projectKey={projectKey}
                  allItems={items}
                  onChange={(patch) => updateItem(idx, patch)}
                  onCollapse={() => setExpandedRowIndex(null)}
                  onOpenFullSheet={() => setDetailSheetIndex(idx)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Spreadsheet Table (>= md) */}
      <div className="hidden md:block flex-1 min-h-0 overflow-auto bg-background border-t border-border">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          {/* Sticky Header */}
          <thead className="sticky top-0 z-20 bg-card/95 backdrop-blur-xs border-b border-border shadow-2xs font-semibold text-muted-foreground select-none">
            <tr>
              {/* Checkbox: sticky left-0 */}
              <th className="sticky left-0 z-30 w-9 bg-card px-2 py-3 text-center border-r border-border/40">
                <Checkbox
                  checked={selectedRows.size === items.length && items.length > 0}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Chọn tất cả các dòng"
                />
              </th>

              {/* Index: sticky left-[36px] */}
              <th className="sticky left-9 z-30 w-10 bg-card px-2 py-3 text-center font-mono border-r border-border/40">
                #
              </th>

              {/* Summary: sticky left-[76px] */}
              <th className="sticky left-[76px] z-30 min-w-[280px] w-80 bg-card px-3 py-3 border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between">
                  <span>
                    Tiêu đề (Summary) <span className="text-destructive">*</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">
                    Hỗ trợ paste Excel
                  </span>
                </div>
              </th>

              {/* Issue Type */}
              {isColVisible("issueType") && (
                <th className="w-38 px-2.5 py-3 border-r border-border/30">
                  Loại task <span className="text-destructive">*</span>
                </th>
              )}

              {/* Parent */}
              {isColVisible("parent") && (
                <th className="w-44 px-2.5 py-3 border-r border-border/30">
                  Task cha (Parent)
                </th>
              )}

              {/* Priority */}
              {isColVisible("priority") && (
                <th className="w-32 px-2.5 py-3 border-r border-border/30">
                  Mức ưu tiên
                </th>
              )}

              {/* Assignee */}
              {isColVisible("assignee") && (
                <th className="w-40 px-2.5 py-3 border-r border-border/30">
                  Người thực hiện
                </th>
              )}

              {/* Components */}
              {isColVisible("components") && (
                <th className="w-40 px-2.5 py-3 border-r border-border/30">
                  Hợp phần (Components)
                </th>
              )}

              {/* Labels */}
              {isColVisible("labels") && (
                <th className="w-40 px-2.5 py-3 border-r border-border/30">
                  Nhãn (Labels)
                </th>
              )}

              {/* Points */}
              {isColVisible("points") && (
                <th className="w-24 px-2.5 py-3 border-r border-border/30">
                  Points
                </th>
              )}

              {/* Original Estimate */}
              {isColVisible("originalEstimate") && (
                <th className="w-28 px-2.5 py-3 border-r border-border/30">
                  Ước tính
                </th>
              )}

              {/* Due Date */}
              {isColVisible("dueDate") && (
                <th className="w-34 px-2.5 py-3 border-r border-border/30">
                  Hạn chót
                </th>
              )}

              {/* Fix Version */}
              {isColVisible("fixVersion") && (
                <th className="w-36 px-2.5 py-3 border-r border-border/30">
                  Phiên bản
                </th>
              )}

              {/* Description */}
              {isColVisible("description") && (
                <th className="w-56 px-2.5 py-3 border-r border-border/30">
                  Mô tả (Description)
                </th>
              )}

              {/* Actions: sticky right-0 */}
              <th className="sticky right-0 z-30 w-24 bg-card px-2 py-3 text-center border-l border-border shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                Thao tác
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border/50">
            {items.map((item, idx) => {
              const rowVal = validationMap.get(idx);
              const hasErrors = (rowVal?.errors.length ?? 0) > 0;
              const isSelected = selectedRows.has(idx);
              const isExpanded = expandedRowIndex === idx;
              const stickyCellBg = isSelected
                ? "bg-primary/10 group-hover:bg-primary/15"
                : hasErrors
                  ? "bg-destructive/10 group-hover:bg-destructive/15"
                  : "bg-card group-hover:bg-muted/40";

              return (
                <tr
                  key={item.clientRef || idx}
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
                  <td className={cn("sticky left-0 z-10 px-2 py-2 text-center border-r border-border/40 transition-colors", stickyCellBg)}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleRowSelection(idx)}
                      aria-label={`Chọn dòng ${idx + 1}`}
                    />
                  </td>

                  {/* Sticky Index & Status */}
                  <td className={cn("sticky left-9 z-10 px-2 py-2 text-center font-mono text-[11px] border-r border-border/40 transition-colors", stickyCellBg)}>
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
                  <td className={cn("sticky left-[76px] z-10 px-3 py-2 border-r border-border shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors", stickyCellBg)}>
                    <textarea
                      data-field="summary"
                      placeholder="Tiêu đề công việc..."
                      value={item.summary}
                      onChange={(e) => updateItem(idx, { summary: e.target.value })}
                      onPaste={(e) => handlePasteOnSummary(e, idx)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleAddRow(idx);
                        } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleDuplicateRow(idx);
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
                          updateItem(idx, patch);
                        }}
                      >
                        <SelectTrigger className={`${inputHeight} text-xs cursor-pointer ${
                          !item.issueTypeId && !defaults.issueTypeId && !metadata.defaultIssueTypeId
                            ? "border-amber-500/40 bg-amber-500/5"
                            : item.issueTypeId
                              ? ""
                              : "text-muted-foreground"
                        }`}>
                          <SelectValue
                            placeholder={getEffectiveIssueTypeName(item)?.name || "Chọn loại task *"}
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
                        onChange={(parent) => updateItem(idx, { parent })}
                        batchItems={items}
                        currentClientRef={item.clientRef}
                        subtaskIssueTypeIds={subtaskIssueTypeIds}
                        placeholder={item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId) ? "Bắt buộc *" : "—"}
                        className="w-full"
                      />
                    </td>
                  )}

                  {/* Priority */}
                  {isColVisible("priority") && (
                    <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
                      <Select
                        value={item.priorityId || ""}
                        onValueChange={(val) => updateItem(idx, { priorityId: val || undefined })}
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
                        onChange={(username) => updateItem(idx, { assignee: username })}
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
                        onChange={(componentIds) => updateItem(idx, { componentIds })}
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
                        onChange={(labels) => updateItem(idx, { labels })}
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
                          updateItem(idx, { points: Number.isFinite(v) && v >= 0 ? v : undefined });
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
                        onChange={(e) => updateItem(idx, { originalEstimate: e.target.value.trim() || undefined })}
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
                        onChange={(e) => updateItem(idx, { dueDate: e.target.value || undefined })}
                        className={`${inputHeight} text-xs`}
                      />
                    </td>
                  )}

                  {/* Fix Version */}
                  {isColVisible("fixVersion") && (
                    <td className={`px-2.5 ${cellPadding} border-r border-border/30`}>
                      <Select
                        value={item.fixVersionIds?.[0] || ""}
                        onValueChange={(val) => updateItem(idx, { fixVersionIds: val ? [val] : undefined })}
                      >
                        <SelectTrigger className={`${inputHeight} text-xs cursor-pointer`}>
                          <SelectValue
                            placeholder={
                              defaults.fixVersionIds?.[0]
                                ? metadata.versionOptions.find((v) => v.id === defaults.fixVersionIds?.[0])?.name || "Mặc định"
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
                        placeholder={defaults.description ? "Kế thừa mô tả mặc định..." : "Mô tả..."}
                        value={item.description ?? ""}
                        onChange={(e) => updateItem(idx, { description: e.target.value || undefined })}
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
                  <td className={cn("sticky right-0 z-10 px-2 py-2 text-center border-l border-border shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)] transition-colors", stickyCellBg)}>
                    <div className="flex items-center justify-center gap-1">
                      {/* Toggle Expand Row Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRowIndex(isExpanded ? null : idx)}
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
                        onClick={() => setDetailSheetIndex(idx)}
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
                        onClick={() => handleDuplicateRow(idx)}
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
                        onClick={() => handleDeleteRow(idx)}
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
            })}
          </tbody>
        </table>

        {/* Quick Start Guide when table is pristine / empty */}
        {items.length === 1 && !items[0].summary.trim() && (
          <div className="m-4 rounded-xl border border-dashed border-border/80 bg-muted/15 p-6 text-center animate-in fade-in duration-200">
            <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-semibold text-foreground">
              Bắt đầu soạn thảo danh sách task cho {projectKey}
            </h4>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Bạn có thể gõ trực tiếp vào ô Tiêu đề, chọn ô rồi dán nhiều dòng từ Excel/Google Sheets (<kbd className="rounded border border-border px-1 py-0.2 font-mono text-[10px] bg-muted/40">Ctrl+V</kbd>), hoặc thêm nhanh các dòng mẫu.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddFiveRows}
                className="h-8 text-xs gap-1.5 cursor-pointer bg-card hover:bg-muted border-border font-medium"
              >
                <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>Thêm nhanh 5 dòng trống</span>
              </Button>
            </div>
          </div>
        )}

        {/* If any row is expanded, render ExpandedRowEditor container */}
        {expandedRowIndex != null && items[expandedRowIndex] && (
          <div className="sticky bottom-0 z-20 border-t-2 border-primary/40 bg-card shadow-lg p-3">
            <ExpandedRowEditor
              item={items[expandedRowIndex]}
              rowIndex={expandedRowIndex}
              defaults={defaults}
              metadata={metadata}
              projectKey={projectKey}
              allItems={items}
              onChange={(patch) => updateItem(expandedRowIndex, patch)}
              onCollapse={() => setExpandedRowIndex(null)}
              onOpenFullSheet={() => setDetailSheetIndex(expandedRowIndex)}
            />
          </div>
        )}
      </div>

      {/* Task Detail Sheet Modal (fallback & deep edit) */}
      <TaskDetailSheet
        open={detailSheetIndex !== null}
        onOpenChange={(open) => {
          if (!open) setDetailSheetIndex(null);
        }}
        item={detailSheetIndex !== null ? items[detailSheetIndex] ?? null : null}
        defaults={defaults}
        metadata={metadata}
        projectKey={projectKey}
        items={items}
        onChange={(updated) => {
          if (detailSheetIndex !== null) updateItem(detailSheetIndex, updated);
        }}
      />
    </div>
  );
}
