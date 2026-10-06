"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { ExpandedRowEditor } from "./expanded-row-editor";
import { TaskDetailSheet } from "./task-detail-sheet";
import { BulkSelectionToolbar } from "./bulk-selection-toolbar";
import { BulkCreateTableHeader } from "./bulk-create-table-header";
import { BulkCreateTableRow } from "./bulk-create-table-row";
import { BulkCreateMobileCard } from "./bulk-create-mobile-card";
import { BulkCreateEmptyGuide } from "./bulk-create-empty-guide";
import { type ColumnId, ALL_COLUMNS } from "./lib/column-definitions";
import { type GridDensity } from "./lib/editor-preferences";
import { parsePastedSpreadsheet } from "./lib/paste-matrix";
import { validateAllRows, type RowValidationResult } from "./lib/client-validation";
import { getEffectiveIssueTypeName } from "./lib/bulk-create-grid-utils";
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
  const [prevFocus, setPrevFocus] = useState<{
    row: number | null | undefined;
    field: string | null | undefined;
  }>({
    row: null,
    field: null,
  });

  if (focusRow !== prevFocus.row || focusField !== prevFocus.field) {
    setPrevFocus({ row: focusRow, field: focusField });
    if (
      focusRow != null &&
      focusRow >= 0 &&
      focusRow < items.length &&
      focusField === "description"
    ) {
      setExpandedRowIndex(focusRow);
    }
  }

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

      if (focusField !== "description") {
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
        const summaryInput = rowElem?.querySelector(
          'textarea[data-field="summary"]'
        ) as HTMLTextAreaElement | null;
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
          const isEpic =
            metadata.issueTypes.find((t) => t.id === next[idx].issueTypeId)?.name.toLowerCase() ===
            "epic";
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

  function handlePasteOnSummary(
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    rowIndex: number
  ) {
    const clipboardText = e.clipboardData.getData("text");
    const pasteResult = parsePastedSpreadsheet(clipboardText, rowIndex, items, metadata);
    if (pasteResult) {
      e.preventDefault();
      onChange(pasteResult.items);
    }
  }

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
        {items.map((item, idx) => (
          <BulkCreateMobileCard
            key={item.clientRef || idx}
            item={item}
            idx={idx}
            rowVal={validationMap.get(idx)}
            isSelected={selectedRows.has(idx)}
            isExpanded={expandedRowIndex === idx}
            itemsLength={items.length}
            metadata={metadata}
            projectKey={projectKey}
            defaults={defaults}
            allItems={items}
            subtaskIssueTypeIds={subtaskIssueTypeIds}
            effectiveIssueTypeName={getEffectiveIssueTypeName(item, defaults, metadata)}
            onUpdateItem={updateItem}
            onToggleSelection={toggleRowSelection}
            onPasteSummary={handlePasteOnSummary}
            onDuplicateRow={handleDuplicateRow}
            onDeleteRow={handleDeleteRow}
            onToggleExpand={(i) => setExpandedRowIndex(expandedRowIndex === i ? null : i)}
            onOpenDetailSheet={(i) => setDetailSheetIndex(i)}
          />
        ))}
      </div>

      {/* Desktop Spreadsheet Table (>= md) */}
      <div className="hidden md:block flex-1 min-h-0 overflow-auto bg-background border-t border-border">
        <table className="w-full min-w-max border-collapse text-left text-xs">
          {/* Sticky Header */}
          <BulkCreateTableHeader
            allSelected={selectedRows.size === items.length && items.length > 0}
            onToggleSelectAll={toggleSelectAll}
            isColVisible={isColVisible}
          />

          {/* Table Body */}
          <tbody className="divide-y divide-border/50">
            {items.map((item, idx) => (
              <BulkCreateTableRow
                key={item.clientRef || idx}
                item={item}
                idx={idx}
                rowVal={validationMap.get(idx)}
                isSelected={selectedRows.has(idx)}
                isExpanded={expandedRowIndex === idx}
                density={density}
                metadata={metadata}
                projectKey={projectKey}
                defaults={defaults}
                items={items}
                subtaskIssueTypeIds={subtaskIssueTypeIds}
                effectiveIssueTypeName={getEffectiveIssueTypeName(item, defaults, metadata)}
                isColVisible={isColVisible}
                onUpdateItem={updateItem}
                onToggleSelection={toggleRowSelection}
                onPasteSummary={handlePasteOnSummary}
                onAddRow={handleAddRow}
                onDuplicateRow={handleDuplicateRow}
                onDeleteRow={handleDeleteRow}
                onToggleExpand={(i) => setExpandedRowIndex(expandedRowIndex === i ? null : i)}
                onOpenDetailSheet={(i) => setDetailSheetIndex(i)}
              />
            ))}
          </tbody>
        </table>

        {/* Quick Start Guide when table is pristine / empty */}
        {items.length === 1 && !items[0].summary.trim() && (
          <BulkCreateEmptyGuide
            projectKey={projectKey}
            onAddFiveRows={handleAddFiveRows}
          />
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
