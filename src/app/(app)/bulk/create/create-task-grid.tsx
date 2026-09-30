"use client";

import { useState } from "react";
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
} from "lucide-react";
import { CsvImportDialog } from "./csv-import-dialog";
import {
  generateUniqueClientRef,
  ensureUniqueClientRefs,
  filterBlankPlaceholderItems,
} from "@/lib/bulk/client-ref";

interface CreateTaskGridProps {
  metadata: BulkCreateProjectMetadata;
  defaults: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  onChange: (updated: BulkCreateRowInput[]) => void;
  onSourceChange?: (source: { type: "grid" | "paste" | "csv"; fileName?: string | null }) => void;
}

export function CreateTaskGrid({
  metadata,
  defaults,
  items,
  onChange,
  onSourceChange,
}: CreateTaskGridProps) {
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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
    source: { type: "csv" | "paste"; fileName?: string | null },
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
            onClick={() => setImportDialogOpen(true)}
            className="h-8 gap-1.5 text-xs cursor-pointer hover:bg-primary/5 hover:text-primary hover:border-primary/40"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            Nhập CSV / Dán Excel
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

      {/* Grid Table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30 font-semibold text-muted-foreground">
              <th className="w-10 px-3 py-2.5 text-center">#</th>
              <th className="min-w-[220px] px-3 py-2.5">
                Tiêu đề (Summary) <span className="text-destructive">*</span>
              </th>
              <th className="w-36 px-2 py-2.5">Loại task</th>
              <th className="w-32 px-2 py-2.5">Mức ưu tiên</th>
              <th className="w-36 px-2 py-2.5">Người thực hiện</th>
              <th className="w-40 px-2 py-2.5">Nhãn</th>
              {metadata.pointsFieldId && <th className="w-20 px-2 py-2.5">Points</th>}
              {metadata.supportsTimeTracking && <th className="w-24 px-2 py-2.5">Ước tính</th>}
              {metadata.supportsDueDate && <th className="w-32 px-2 py-2.5">Hạn chót</th>}
              {metadata.versionOptions.length > 0 && <th className="w-36 px-2 py-2.5">Phiên bản</th>}
              <th className="w-20 px-2 py-2.5 text-center">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {items.map((item, idx) => {
              const hasSummary = Boolean(item.summary.trim());

              return (
                <tr
                  key={item.clientRef || idx}
                  className="group transition-colors hover:bg-muted/15"
                >
                  {/* Row index */}
                  <td className="px-3 py-2 text-center font-mono text-[11px] text-muted-foreground">
                    {idx + 1}
                  </td>

                  {/* Summary */}
                  <td className="px-3 py-2">
                    <Input
                      placeholder="Nhập tiêu đề công việc..."
                      value={item.summary}
                      onChange={(e) => updateItem(idx, { summary: e.target.value })}
                      className={`h-8 text-xs transition-colors ${
                        !hasSummary ? "border-amber-500/40 bg-amber-500/5 focus-visible:ring-amber-500" : ""
                      }`}
                    />
                  </td>

                  {/* Issue Type */}
                  <td className="px-2 py-2">
                    <Select
                      value={item.issueTypeId || ""}
                      onValueChange={(val) => updateItem(idx, { issueTypeId: val || undefined })}
                    >
                      <SelectTrigger className="h-8 text-xs cursor-pointer">
                        <SelectValue
                          placeholder={
                            defaults.issueTypeId
                              ? metadata.issueTypes.find((t) => t.id === defaults.issueTypeId)?.name || "Mặc định"
                              : "Mặc định"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {metadata.issueTypes
                          .filter((t) => !t.subtask)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id} className="text-xs cursor-pointer">
                              {t.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Priority */}
                  <td className="px-2 py-2">
                    <Select
                      value={item.priorityId || ""}
                      onValueChange={(val) => updateItem(idx, { priorityId: val || undefined })}
                    >
                      <SelectTrigger className="h-8 text-xs cursor-pointer">
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
                  <td className="px-2 py-2">
                    <Input
                      placeholder={defaults.assignee || "Chưa gán"}
                      value={item.assignee ?? ""}
                      onChange={(e) => updateItem(idx, { assignee: e.target.value.trim() || undefined })}
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Labels */}
                  <td className="px-2 py-2">
                    <Input
                      placeholder={defaults.labels?.join(", ") || "vd: api, bug"}
                      value={item.labels?.join(", ") ?? ""}
                      onChange={(e) => {
                        const arr = e.target.value
                          .split(",")
                          .map((l) => l.trim())
                          .filter(Boolean);
                        updateItem(idx, { labels: arr.length > 0 ? arr : undefined });
                      }}
                      className="h-8 text-xs"
                    />
                  </td>

                  {/* Points */}
                  {metadata.pointsFieldId && (
                    <td className="px-2 py-2">
                      <Input
                        type="number"
                        min="0"
                        placeholder={defaults.points != null ? String(defaults.points) : "—"}
                        value={item.points ?? ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          updateItem(idx, { points: Number.isFinite(v) && v >= 0 ? v : undefined });
                        }}
                        className="h-8 text-xs"
                      />
                    </td>
                  )}

                  {/* Estimate */}
                  {metadata.supportsTimeTracking && (
                    <td className="px-2 py-2">
                      <Input
                        placeholder={defaults.originalEstimate || "1d 2h"}
                        value={item.originalEstimate ?? ""}
                        onChange={(e) => updateItem(idx, { originalEstimate: e.target.value.trim() || undefined })}
                        className="h-8 text-xs"
                      />
                    </td>
                  )}

                  {/* Due Date */}
                  {metadata.supportsDueDate && (
                    <td className="px-2 py-2">
                      <Input
                        type="date"
                        value={item.dueDate ?? ""}
                        onChange={(e) => updateItem(idx, { dueDate: e.target.value || undefined })}
                        className="h-8 text-xs"
                      />
                    </td>
                  )}

                  {/* Fix Version */}
                  {metadata.versionOptions.length > 0 && (
                    <td className="px-2 py-2">
                      <Select
                        value={item.fixVersionIds?.[0] || ""}
                        onValueChange={(val) => updateItem(idx, { fixVersionIds: val ? [val] : undefined })}
                      >
                        <SelectTrigger className="h-8 text-xs cursor-pointer">
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
                  <td className="px-2 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
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

      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportItems}
        existingFilledCount={items.filter((i) => Boolean(i.summary.trim())).length}
      />
    </div>
  );
}
