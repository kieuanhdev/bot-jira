"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Upload,
  RotateCcw,
  Settings2,
  ClipboardCopy,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { CsvImportDialog } from "./csv-import-dialog";
import { JiraTemplateDialog } from "./jira-template-dialog";
import { AssigneeCombobox } from "./assignee-combobox";
import { ParentCombobox } from "./parent-combobox";
import { LabelCombobox } from "./label-combobox";
import { TaskDetailSheet } from "./task-detail-sheet";
import { BulkSelectionToolbar } from "./bulk-selection-toolbar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  generateUniqueClientRef,
  ensureUniqueClientRefs,
  filterBlankPlaceholderItems,
} from "@/lib/bulk/client-ref";

interface CreateTaskGridProps {
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  defaults: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  onChange: (updated: BulkCreateRowInput[]) => void;
  onSourceChange?: (source: { type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null }) => void;
  focusRow?: number | null;
  onClearFocusRow?: () => void;
}

export function CreateTaskGrid({
  metadata,
  projectKey,
  defaults,
  items,
  onChange,
  onSourceChange,
  focusRow,
  onClearFocusRow,
}: CreateTaskGridProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [detailSheetIndex, setDetailSheetIndex] = useState<number | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const tableRef = useRef<HTMLDivElement>(null);

  /**
   * Resolve the effective issue type name for a row.
   * If the row has its own issueTypeId, return that name.
   * If it inherits from defaults, return "TypeName (mặc định)".
   * Otherwise return null (user must choose).
   */
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

  useEffect(() => {
    if (focusRow != null && focusRow >= 0 && focusRow < items.length) {
      const row = tableRef.current?.querySelector(`[data-row-index="${focusRow}"]`);
      row?.scrollIntoView({ behavior: "smooth", block: "center" });
      const target = focusRow;
      setTimeout(() => {
        setDetailSheetIndex(target);
        onClearFocusRow?.();
      }, 0);
    }
  }, [focusRow, items.length, onClearFocusRow]);

  const subtaskIssueTypeIds = new Set(
    metadata.issueTypes.filter((t) => t.subtask).map((t) => t.id)
  );
  const showParentColumn = metadata.hasSubtaskTypes;

  function handleAddRow() {
    if (items.length >= MAX_BULK_CREATE_ITEMS) return;
    const existingRefs = new Set(items.map((i) => i.clientRef).filter(Boolean));
    const newRef = generateUniqueClientRef(existingRefs, "row");
    onChange([
      ...items,
      {
        clientRef: newRef,
        summary: "",
      },
    ]);
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
    onChange(next);
  }

  function handleClearAll() {
    onChange([
      {
        clientRef: "row-1",
        summary: "",
      },
    ]);
  }

  function updateItem(idx: number, patch: Partial<BulkCreateRowInput>) {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }

  function handleImportItems(
    imported: BulkCreateRowInput[],
    source: { type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null },
    mode: "replace" | "append"
  ) {
    if (mode === "replace") {
      onChange(ensureUniqueClientRefs(imported));
    } else {
      const nonBlank = filterBlankPlaceholderItems(items);
      const merged = ensureUniqueClientRefs([...nonBlank, ...imported]);
      onChange(merged.slice(0, MAX_BULK_CREATE_ITEMS));
    }
    if (onSourceChange) {
      onSourceChange(source);
    }
  }

  function handleTemplateItem(templateInput: BulkCreateRowInput | BulkCreateRowInput[]) {
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
    onChange(ensureUniqueClientRefs([...nonBlank, ...preparedRows]).slice(0, MAX_BULK_CREATE_ITEMS));
  }

  async function handleDownloadExcelTemplate() {
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
  }

  function toggleRowSelection(idx: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedRows.size === items.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(items.map((_, i) => i)));
    }
  }

  function handleBulkApply(indices: Set<number>, patch: Partial<BulkCreateRowInput>) {
    const next = [...items];
    for (const idx of indices) {
      if (next[idx]) next[idx] = { ...next[idx], ...patch };
    }
    onChange(next);
    setSelectedRows(new Set());
  }

  function handleBulkDelete(indices: Set<number>) {
    const remaining = items.filter((_, i) => !indices.has(i));
    onChange(remaining.length > 0 ? remaining : [{ clientRef: "row-1", summary: "" }]);
    setSelectedRows(new Set());
  }

  function handleClearOverrides(indices: Set<number>) {
    const next = [...items];
    for (const idx of indices) {
      if (next[idx]) {
        next[idx] = { clientRef: next[idx].clientRef!, summary: next[idx].summary };
      }
    }
    onChange(next);
    setSelectedRows(new Set());
  }

  return (
    <div className="space-y-3">
      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Badge variant={items.length > 0 ? "info" : "secondary"} className="font-mono text-xs">
            {items.length} / {MAX_BULK_CREATE_ITEMS} task
          </Badge>
          <span className="text-xs text-muted-foreground">
            {items.filter((i) => i.summary.trim()).length} task đã có tiêu đề
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadExcelTemplate}
            disabled={downloadingTemplate || !metadata?.canCreate}
            title={`Tải file mẫu Excel (.xlsx) chuẩn cấu hình cho dự án ${projectKey}`}
            className="h-8 gap-1.5 text-xs cursor-pointer text-teal-700 hover:text-teal-800 hover:bg-teal-500/10 hover:border-teal-500/40 dark:text-teal-400 dark:hover:text-teal-300"
          >
            {downloadingTemplate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Tải mẫu Excel
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setImportDialogOpen(true)}
            className="h-8 gap-1.5 text-xs cursor-pointer hover:bg-primary/5 hover:text-primary hover:border-primary/40"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Nhập CSV / Excel
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTemplateDialogOpen(true)}
            disabled={items.length >= MAX_BULK_CREATE_ITEMS}
            className="h-8 gap-1.5 text-xs cursor-pointer hover:bg-teal-500/5 hover:text-teal-700 hover:border-teal-500/40 dark:hover:text-teal-400"
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
            Lấy task Jira làm mẫu
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRow}
            disabled={items.length >= MAX_BULK_CREATE_ITEMS}
            className="h-8 gap-1.5 text-xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Thêm dòng
          </Button>

          {items.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Làm mới bảng
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Selection Toolbar */}
      <BulkSelectionToolbar
        selectedCount={selectedRows.size}
        totalItems={items.length}
        metadata={metadata}
        projectKey={projectKey}
        selectedIndices={selectedRows}
        onApply={handleBulkApply}
        onDelete={handleBulkDelete}
        onClearOverrides={handleClearOverrides}
        onClearSelection={() => setSelectedRows(new Set())}
      />

      {/* Grid Container (Dual mode: Responsive Cards on mobile, Table on desktop) */}
      <div ref={tableRef} className="space-y-4">
        {/* Mobile View (< md) - Responsive Cards, No Horizontal Scroll */}
        <div className="block md:hidden space-y-3">
          {items.length > 0 && (
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedRows.size === items.length && items.length > 0}
                  onCheckedChange={() => toggleSelectAll()}
                  aria-label="Chọn tất cả dòng"
                />
                <span className="font-medium text-foreground">Chọn tất cả</span>
                <span>({items.length})</span>
              </div>
              {selectedRows.size > 0 && (
                <span className="text-[11px] font-medium text-primary">
                  Đã chọn {selectedRows.size} dòng
                </span>
              )}
            </div>
          )}

          {items.map((item, idx) => {
            const hasSummary = Boolean(item.summary.trim());
            const isSubtask = item.issueTypeId ? subtaskIssueTypeIds.has(item.issueTypeId) : false;

            return (
              <div
                key={item.clientRef || idx}
                data-row-index={idx}
                className={`rounded-lg border transition-colors p-3.5 space-y-3 bg-card ${
                  selectedRows.has(idx) ? "border-primary/50 bg-primary/5 shadow-xs" : "border-border shadow-xs"
                }`}
              >
                {/* Card Top: Checkbox, Index, Subtask Badge & Action Buttons */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedRows.has(idx)}
                      onCheckedChange={() => toggleRowSelection(idx)}
                      aria-label={`Chọn dòng ${idx + 1}`}
                    />
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      #{idx + 1}
                    </span>
                    {isSubtask && (
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-amber-500/40 text-amber-600 dark:text-amber-400">
                        Subtask
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDetailSheetIndex(idx)}
                      title="Mở chi tiết"
                      className="h-7 px-2 text-xs cursor-pointer text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="text-[11px]">Chi tiết</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicateRow(idx)}
                      disabled={items.length >= MAX_BULK_CREATE_ITEMS}
                      title="Nhân bản dòng"
                      className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
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
                </div>

                {/* Summary input — textarea auto-grow BC-SMART-302 */}
                <div>
                  <textarea
                    placeholder="Tiêu đề công việc (Summary) *"
                    value={item.summary}
                    onChange={(e) => updateItem(idx, { summary: e.target.value })}
                    rows={1}
                    className={`flex w-full rounded-md border bg-background px-3 py-2.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] max-h-[72px] resize-none overflow-y-auto transition-colors ${
                      !hasSummary ? "border-amber-500/40 bg-amber-500/5 focus-visible:ring-amber-500" : "border-input"
                    }`}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = `${Math.min(t.scrollHeight, 72)}px`;
                    }}
                  />
                </div>

                {/* Core Field Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Issue Type — BC-SMART-301: required asterisk + effective name */}
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground font-medium">
                      Loại task <span className="text-destructive">*</span>
                    </span>
                    <Select
                      value={item.issueTypeId || ""}
                      onValueChange={(val) => {
                        const newType = val || undefined;
                        const isSub = newType ? subtaskIssueTypeIds.has(newType) : false;
                        const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
                        if (!isSub) {
                          patch.parent = null;
                        } else if (!item.parent) {
                          patch.parent = undefined;
                        }
                        updateItem(idx, patch);
                      }}
                    >
                      <SelectTrigger className={`h-10 text-xs cursor-pointer w-full ${
                        !item.issueTypeId && !defaults.issueTypeId && !metadata.defaultIssueTypeId
                          ? "border-amber-500/40 bg-amber-500/5"
                          : item.issueTypeId
                            ? ""
                            : "text-muted-foreground"
                      }`}>
                        <SelectValue
                          placeholder={(() => {
                            const eff = getEffectiveIssueTypeName(item);
                            return eff ? eff.name : "Chọn loại task *";
                          })()}
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

                  {/* Parent if project has subtasks */}
                  {showParentColumn && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        Task cha {isSubtask && <span className="text-destructive">*</span>}
                      </span>
                      <ParentCombobox
                        projectKey={projectKey}
                        value={item.parent}
                        onChange={(parent) => updateItem(idx, { parent })}
                        batchItems={items}
                        currentClientRef={item.clientRef}
                        subtaskIssueTypeIds={subtaskIssueTypeIds}
                        placeholder={isSubtask ? "Bắt buộc *" : "—"}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Assignee */}
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-[11px] text-muted-foreground font-medium">Người thực hiện</span>
                    <AssigneeCombobox
                      projectKey={projectKey}
                      value={item.assignee ?? null}
                      onChange={(username) => updateItem(idx, { assignee: username })}
                      placeholder={defaults.assignee || "Chưa gán"}
                    />
                  </div>
                </div>

                {/* Overrides & Extra details badge bar */}
                <div className="pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {item.priorityId && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      Ưu tiên: {metadata.priorityOptions.find((p) => p.id === item.priorityId)?.name || item.priorityId}
                    </Badge>
                  )}
                  {item.labels && item.labels.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      {item.labels.length} nhãn
                    </Badge>
                  )}
                  {item.points != null && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      {item.points} pts
                    </Badge>
                  )}
                  {item.dueDate && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      Hạn: {item.dueDate}
                    </Badge>
                  )}
                  {item.originalEstimate && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      Est: {item.originalEstimate}
                    </Badge>
                  )}
                  {item.fixVersionIds && item.fixVersionIds.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      Ver: {item.fixVersionIds.length}
                    </Badge>
                  )}
                  {item.description && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-normal">
                      Có mô tả
                    </Badge>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailSheetIndex(idx)}
                    className="text-[11px] text-primary hover:underline cursor-pointer ml-auto flex items-center gap-0.5 py-0.5"
                  >
                    <Settings2 className="h-3 w-3" />
                    Chỉnh sửa tất cả trường &rarr;
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View (>= md) - Standard Grid Table */}
        {/* Desktop View — BC-SMART-302: wider columns, taller controls */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <table className="w-full min-w-[960px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30 font-semibold text-muted-foreground">
                <th className="w-8 px-2 py-3 text-center">
                  <Checkbox
                    checked={selectedRows.size === items.length && items.length > 0}
                    onCheckedChange={() => toggleSelectAll()}
                    aria-label="Chọn tất cả"
                  />
                </th>
                <th className="w-10 px-3 py-3 text-center">#</th>
                <th className="min-w-[320px] px-3 py-3">
                  Tiêu đề (Summary) <span className="text-destructive">*</span>
                </th>
                <th className="w-40 px-2 py-3">
                  Loại task <span className="text-destructive">*</span>
                </th>
                {showParentColumn && <th className="w-44 px-2 py-3">Parent</th>}
                <th className="w-32 px-2 py-3">Mức ưu tiên</th>
                <th className="w-36 px-2 py-3">Người thực hiện</th>
                <th className="w-40 px-2 py-3">Nhãn</th>
                {metadata.pointsFieldId && <th className="w-20 px-2 py-3">Points</th>}
                {metadata.supportsTimeTracking && <th className="w-24 px-2 py-3">Ước tính</th>}
                {metadata.supportsDueDate && <th className="w-32 px-2 py-3">Hạn chót</th>}
                {metadata.versionOptions.length > 0 && <th className="w-36 px-2 py-3">Phiên bản</th>}
                <th className="w-20 px-2 py-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((item, idx) => {
                const hasSummary = Boolean(item.summary.trim());

                return (
                  <tr
                    key={item.clientRef || idx}
                    data-row-index={idx}
                    className={`group transition-colors hover:bg-muted/15 ${selectedRows.has(idx) ? "bg-primary/5" : ""}`}
                  >
                    {/* Select checkbox */}
                    <td className="px-2 py-2.5 text-center">
                      <Checkbox
                        checked={selectedRows.has(idx)}
                        onCheckedChange={() => toggleRowSelection(idx)}
                        aria-label={`Chọn dòng ${idx + 1}`}
                      />
                    </td>

                    {/* Row index */}
                    <td className="px-3 py-2.5 text-center font-mono text-[11px] text-muted-foreground">
                      {idx + 1}
                    </td>

                    {/* Summary — BC-SMART-302: taller input, wider column with auto-grow textarea */}
                    <td className="px-3 py-2.5">
                      <textarea
                        placeholder="Nhập tiêu đề công việc..."
                        value={item.summary}
                        onChange={(e) => updateItem(idx, { summary: e.target.value })}
                        rows={1}
                        className={`flex w-full rounded-md border bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[40px] max-h-[72px] resize-none overflow-y-auto transition-colors ${
                          !hasSummary ? "border-amber-500/40 bg-amber-500/5 focus-visible:ring-amber-500" : "border-input"
                        }`}
                        onInput={(e) => {
                          const t = e.currentTarget;
                          t.style.height = "auto";
                          t.style.height = `${Math.min(t.scrollHeight, 72)}px`;
                        }}
                        onKeyDown={(e) => {
                          // Shift+Enter for newline, Enter alone does nothing extra (stays in textarea)
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.stopPropagation();
                          }
                        }}
                      />
                    </td>

                    {/* Issue Type — BC-SMART-301: effective name, required highlight */}
                    <td className="px-2 py-2.5">
                      <Select
                        value={item.issueTypeId || ""}
                        onValueChange={(val) => {
                          const newType = val || undefined;
                          const isSubtask = newType ? subtaskIssueTypeIds.has(newType) : false;
                          const patch: Partial<BulkCreateRowInput> = { issueTypeId: newType };
                          if (!isSubtask) {
                            patch.parent = null;
                          } else if (!item.parent) {
                            patch.parent = undefined;
                          }
                          updateItem(idx, patch);
                        }}
                      >
                        <SelectTrigger className={`h-10 text-xs cursor-pointer ${
                          !item.issueTypeId && !defaults.issueTypeId && !metadata.defaultIssueTypeId
                            ? "border-amber-500/40 bg-amber-500/5"
                            : item.issueTypeId
                              ? ""
                              : "text-muted-foreground"
                        }`}>
                          <SelectValue
                            placeholder={(() => {
                              const eff = getEffectiveIssueTypeName(item);
                              return eff ? eff.name : "Chọn loại task *";
                            })()}
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

                    {/* Parent */}
                    {showParentColumn && (
                      <td className="px-2 py-2.5">
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
                    <td className="px-2 py-2.5">
                      <Select
                        value={item.priorityId || ""}
                        onValueChange={(val) => updateItem(idx, { priorityId: val || undefined })}
                      >
                        <SelectTrigger className="h-10 text-xs cursor-pointer">
                          <SelectValue
                            placeholder={
                              defaults.priorityId
                                ? metadata.priorityOptions.find((p) => p.id === defaults.priorityId)?.name || "Mặc định"
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

                    {/* Assignee */}
                    <td className="px-2 py-2.5">
                      <AssigneeCombobox
                        projectKey={projectKey}
                        value={item.assignee ?? null}
                        onChange={(username) => updateItem(idx, { assignee: username })}
                        placeholder={defaults.assignee || "Chưa gán"}
                      />
                    </td>

                    {/* Labels */}
                    <td className="px-2 py-2.5">
                      <LabelCombobox
                        projectKey={projectKey}
                        value={item.labels}
                        onChange={(labels) => updateItem(idx, { labels })}
                        placeholder={defaults.labels?.length ? defaults.labels.join(", ") : "vd: api, bug"}
                        compact
                      />
                    </td>

                    {/* Points */}
                    {metadata.pointsFieldId && (
                      <td className="px-2 py-2.5">
                        <Input
                          type="number"
                          min="0"
                          placeholder={defaults.points != null ? String(defaults.points) : "—"}
                          value={item.points ?? ""}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            updateItem(idx, { points: Number.isFinite(v) && v >= 0 ? v : undefined });
                          }}
                          className="h-10 text-xs"
                        />
                      </td>
                    )}

                    {/* Estimate */}
                    {metadata.supportsTimeTracking && (
                      <td className="px-2 py-2.5">
                        <Input
                          placeholder={defaults.originalEstimate || "1d 2h"}
                          value={item.originalEstimate ?? ""}
                          onChange={(e) => updateItem(idx, { originalEstimate: e.target.value.trim() || undefined })}
                          className="h-10 text-xs"
                        />
                      </td>
                    )}

                    {/* Due Date */}
                    {metadata.supportsDueDate && (
                      <td className="px-2 py-2.5">
                        <Input
                          type="date"
                          value={item.dueDate ?? ""}
                          onChange={(e) => updateItem(idx, { dueDate: e.target.value || undefined })}
                          className="h-10 text-xs"
                        />
                      </td>
                    )}

                    {/* Fix Version */}
                    {metadata.versionOptions.length > 0 && (
                      <td className="px-2 py-2.5">
                        <Select
                          value={item.fixVersionIds?.[0] || ""}
                          onValueChange={(val) => updateItem(idx, { fixVersionIds: val ? [val] : undefined })}
                        >
                          <SelectTrigger className="h-10 text-xs cursor-pointer">
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

                    {/* Actions */}
                    <td className="px-2 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDetailSheetIndex(idx)}
                          title="Chi tiết"
                          className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-primary"
                        >
                          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateRow(idx)}
                          disabled={items.length >= MAX_BULK_CREATE_ITEMS}
                          title="Nhân bản dòng"
                          className="h-7 w-7 p-0 cursor-pointer text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
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
        </div>
      </div>

      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportItems}
        existingFilledCount={items.filter((i) => Boolean(i.summary.trim())).length}
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

      <TaskDetailSheet
        open={detailSheetIndex !== null}
        onOpenChange={(open) => { if (!open) setDetailSheetIndex(null); }}
        item={detailSheetIndex !== null ? (items[detailSheetIndex] ?? null) : null}
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
