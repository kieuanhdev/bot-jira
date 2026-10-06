"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { BulkCreateEditorTopbar } from "./bulk-create-editor-topbar";
import { BulkCreateCommandBar } from "./bulk-create-command-bar";
import { BulkCreateDataGrid } from "./bulk-create-data-grid";
import { BulkCreateStatusBar } from "./bulk-create-status-bar";
import { CsvImportDialog } from "./csv-import-dialog";
import { JiraTemplateDialog } from "./jira-template-dialog";
import {
  getDefaultVisibleColumnIds,
  getAvailableToggleableColumns,
  type ColumnId,
} from "./lib/column-definitions";
import {
  getStoredColumns,
  setStoredColumns,
  resetStoredColumns,
  getStoredDensity,
  setStoredDensity,
  type GridDensity,
} from "./lib/editor-preferences";
import { validateAllRows } from "./lib/client-validation";
import {
  generateUniqueClientRef,
  ensureUniqueClientRefs,
  filterBlankPlaceholderItems,
} from "@/lib/bulk/client-ref";

interface BulkCreateEditorShellProps {
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  availableProjects: string[];
  onSelectProject: (key: string) => void;
  defaults: BulkCreateFieldDefaults;
  onDefaultsChange: (defaults: BulkCreateFieldDefaults) => void;
  items: BulkCreateRowInput[];
  onItemsChange: (items: BulkCreateRowInput[]) => void;
  onSourceChange?: (source: { type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null }) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPreview: () => void;
  isPreviewPending: boolean;
  isSavingDraft: boolean;
  draftSavedTime: number | null;
  focusRow?: number | null;
  focusField?: string | null;
  onClearFocusRow?: () => void;
}

export function BulkCreateEditorShell({
  metadata,
  projectKey,
  availableProjects,
  onSelectProject,
  defaults,
  onDefaultsChange,
  items,
  onItemsChange,
  onSourceChange,
  isFullscreen,
  onToggleFullscreen,
  onPreview,
  isPreviewPending,
  isSavingDraft,
  draftSavedTime,
  focusRow,
  focusField,
  onClearFocusRow,
}: BulkCreateEditorShellProps) {
  // Preferences are read from localStorage on first render; the shell is only mounted client-side after metadata loads.
  const [density, setDensityState] = useState<GridDensity>(() => getStoredDensity());
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => {
    if (!projectKey) return [];
    const defaultsCols = getDefaultVisibleColumnIds(metadata);
    return getStoredColumns(projectKey, defaultsCols);
  });
  const [prevProjectKey, setPrevProjectKey] = useState(projectKey);
  const [prevMetadata, setPrevMetadata] = useState(metadata);
  if (projectKey !== prevProjectKey || metadata !== prevMetadata) {
    setPrevProjectKey(projectKey);
    setPrevMetadata(metadata);
    if (projectKey) {
      const defaultsCols = getDefaultVisibleColumnIds(metadata);
      setVisibleColumnIds(getStoredColumns(projectKey, defaultsCols));
    }
  }
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Lock document body scroll when fullscreen is active
  useEffect(() => {
    if (isFullscreen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isFullscreen]);

  const toggleableColumns = useMemo(
    () => getAvailableToggleableColumns(metadata),
    [metadata]
  );

  const handleDensityChange = useCallback((newDensity: GridDensity) => {
    setDensityState(newDensity);
    setStoredDensity(newDensity);
  }, []);

  const handleToggleColumn = useCallback(
    (colId: ColumnId) => {
      setVisibleColumnIds((prev) => {
        const next = prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId];
        setStoredColumns(projectKey, next);
        return next;
      });
    },
    [projectKey]
  );

  const handleResetColumns = useCallback(() => {
    const defaultCols = getDefaultVisibleColumnIds(metadata);
    resetStoredColumns(projectKey);
    setVisibleColumnIds(defaultCols);
  }, [projectKey, metadata]);

  const handleAddRow = useCallback(() => {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;
    const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
    const newRef = generateUniqueClientRef(existingRefs, "row");
    onItemsChange([...items, { clientRef: newRef, summary: "" }]);
  }, [items, onItemsChange]);

  const handleClearAll = useCallback(() => {
    onItemsChange([{ clientRef: "row-1", summary: "" }]);
    setSelectedRows(new Set());
  }, [onItemsChange]);

  const handleImportItems = useCallback(
    (
      imported: BulkCreateRowInput[],
      source: { type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null },
      mode: "replace" | "append"
    ) => {
      if (mode === "replace") {
        onItemsChange(ensureUniqueClientRefs(imported));
      } else {
        const nonBlank = filterBlankPlaceholderItems(items);
        const merged = ensureUniqueClientRefs([...nonBlank, ...imported]);
        onItemsChange(merged.slice(0, MAX_BULK_CREATE_ITEMS));
      }
      if (onSourceChange) {
        onSourceChange(source);
      }
    },
    [items, onItemsChange, onSourceChange]
  );

  const handleTemplateItem = useCallback(
    (templateInput: BulkCreateRowInput | BulkCreateRowInput[]) => {
      const rows = Array.isArray(templateInput) ? templateInput : [templateInput];
      if (items.length + rows.length > MAX_BULK_CREATE_ITEMS) return;

      const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
      const refMap = new Map<string, string>();
      const preparedRows: BulkCreateRowInput[] = [];

      for (const row of rows) {
        const placeholderRef = row.clientRef || "tpl";
        const newRef = generateUniqueClientRef(existingRefs, placeholderRef.startsWith("tpl-") ? placeholderRef : "tpl");
        existingRefs.add(newRef);
        if (row.clientRef) {
          refMap.set(row.clientRef, newRef);
        }
        preparedRows.push({
          ...row,
          clientRef: newRef,
        });
      }

      // Remap batch parent clientRefs if referencing an added row
      for (const row of preparedRows) {
        if (row.parent?.type === "batch" && refMap.has(row.parent.clientRef)) {
          row.parent = {
            type: "batch",
            clientRef: refMap.get(row.parent.clientRef)!,
          };
        }
      }

      const nonBlank = filterBlankPlaceholderItems(items);
      onItemsChange(ensureUniqueClientRefs([...nonBlank, ...preparedRows]).slice(0, MAX_BULK_CREATE_ITEMS));
    },
    [items, onItemsChange]
  );

  const handleDownloadExcelTemplate = useCallback(async () => {
    if (!projectKey) return;
    setDownloadingTemplate(true);
    try {
      const res = await fetch(`/api/bulk/create/excel-template?project=${encodeURIComponent(projectKey)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Không thể tải mẫu Excel" }));
        alert(err.error || `Lỗi tải file (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      let filename = `bulk-create-${projectKey}.xlsx`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Lỗi khi tải mẫu Excel: ${(err as Error).message}`);
    } finally {
      setDownloadingTemplate(false);
    }
  }, [projectKey]);

  // Validation metrics for status bar
  const validationSummary = useMemo(
    () => validateAllRows(items, defaults, metadata),
    [items, defaults, metadata]
  );

  const filledCount = useMemo(
    () => items.filter((i) => i.summary.trim().length > 0).length,
    [items]
  );

  const [currentErrorRow, setCurrentErrorRow] = useState<number | null>(null);

  const handleGoToNextError = useCallback(() => {
    const errorRows = validationSummary.rowResults
      .filter((r) => !r.isValid)
      .map((r) => r.rowIndex);

    if (errorRows.length === 0) return;

    let nextTarget = errorRows[0];
    if (currentErrorRow != null) {
      const currentIndexInErrors = errorRows.indexOf(currentErrorRow);
      if (currentIndexInErrors >= 0 && currentIndexInErrors < errorRows.length - 1) {
        nextTarget = errorRows[currentIndexInErrors + 1];
      }
    }
    setCurrentErrorRow(nextTarget);

    const rowElem = document.querySelector(`[data-row-index="${nextTarget}"]`);
    rowElem?.scrollIntoView({ behavior: "smooth", block: "center" });
    const summaryInput = rowElem?.querySelector('textarea[data-field="summary"]') as HTMLTextAreaElement | null;
    summaryInput?.focus();
  }, [validationSummary, currentErrorRow]);

  const shellContent = (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col h-dvh bg-background text-foreground overflow-hidden"
          : "flex flex-col border border-border rounded-lg bg-card overflow-hidden shadow-xs"
      }
    >
      {/* Top bar (only in fullscreen) */}
      {isFullscreen && (
        <BulkCreateEditorTopbar
          projectKey={projectKey}
          totalRows={items.length}
          filledCount={filledCount}
          isSavingDraft={isSavingDraft}
          draftSavedTime={draftSavedTime}
          onExitFullscreen={onToggleFullscreen}
          onPreview={onPreview}
          isPreviewPending={isPreviewPending}
        />
      )}

      {/* Command Bar */}
      <BulkCreateCommandBar
        metadata={metadata}
        projectKey={projectKey}
        availableProjects={availableProjects}
        onSelectProject={onSelectProject}
        defaults={defaults}
        onDefaultsChange={onDefaultsChange}
        onOpenImport={() => setImportDialogOpen(true)}
        onDownloadTemplate={handleDownloadExcelTemplate}
        isDownloadingTemplate={downloadingTemplate}
        onOpenTemplateDialog={() => setTemplateDialogOpen(true)}
        toggleableColumns={toggleableColumns}
        visibleColumnIds={visibleColumnIds}
        onToggleColumn={handleToggleColumn}
        onResetColumns={handleResetColumns}
        density={density}
        onDensityChange={handleDensityChange}
        onAddRow={handleAddRow}
        onClearAll={handleClearAll}
        totalRows={items.length}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />

      {/* Main Data Grid */}
      <BulkCreateDataGrid
        metadata={metadata}
        projectKey={projectKey}
        defaults={defaults}
        items={items}
        onChange={onItemsChange}
        visibleColumnIds={visibleColumnIds}
        density={density}
        focusRow={focusRow}
        focusField={focusField}
        onClearFocusRow={onClearFocusRow}
        selectedRows={selectedRows}
        onSelectedRowsChange={setSelectedRows}
      />

      {/* Status & Action Dock */}
      <BulkCreateStatusBar
        totalItems={items.length}
        filledItemsCount={filledCount}
        totalErrors={validationSummary.totalErrors}
        totalWarnings={validationSummary.totalWarnings}
        selectedCount={selectedRows.size}
        onGoToNextError={handleGoToNextError}
        onPreview={onPreview}
        isPreviewPending={isPreviewPending}
        isSavingDraft={isSavingDraft}
        draftSavedTime={draftSavedTime}
        isFullscreen={isFullscreen}
        onToggleFullscreen={onToggleFullscreen}
        onAddRow={handleAddRow}
        canAddRow={items.length < MAX_BULK_CREATE_ITEMS}
      />

      {/* Dialogs */}
      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportItems}
        existingFilledCount={filledCount}
        projectKey={projectKey}
        metadata={metadata}
      />

      <JiraTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        projectKey={projectKey}
        metadata={metadata}
        onAddRow={handleTemplateItem}
      />
    </div>
  );

  return shellContent;
}
