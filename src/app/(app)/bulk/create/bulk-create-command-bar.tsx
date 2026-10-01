"use client";

import { useState } from "react";
import {
  type BulkCreateFieldDefaults,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SlidersHorizontal,
  Upload,
  FileSpreadsheet,
  ClipboardCopy,
  Plus,
  RotateCcw,
  Keyboard,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Loader2,
} from "lucide-react";
import { BulkCreateColumnPicker } from "./bulk-create-column-picker";
import { BulkCreateShortcutsDialog } from "./bulk-create-shortcuts-dialog";
import { BulkCreateDefaultsDialog } from "./bulk-create-defaults-dialog";
import { type ColumnDefinition, type ColumnId } from "./lib/column-definitions";
import { type GridDensity } from "./lib/editor-preferences";

interface BulkCreateCommandBarProps {
  metadata: BulkCreateProjectMetadata;
  projectKey: string;
  availableProjects: string[];
  onSelectProject: (key: string) => void;
  defaults: BulkCreateFieldDefaults;
  onDefaultsChange: (defaults: BulkCreateFieldDefaults) => void;
  onOpenImport: () => void;
  onDownloadTemplate: () => void;
  isDownloadingTemplate: boolean;
  onOpenTemplateDialog: () => void;
  toggleableColumns: ColumnDefinition[];
  visibleColumnIds: string[];
  onToggleColumn: (id: ColumnId) => void;
  onResetColumns: () => void;
  density: GridDensity;
  onDensityChange: (density: GridDensity) => void;
  onAddRow: () => void;
  onClearAll: () => void;
  totalRows: number;
  isFullscreen: boolean;
  onToggleFullscreen?: () => void;
}

export function BulkCreateCommandBar({
  metadata,
  projectKey,
  availableProjects,
  onSelectProject,
  defaults,
  onDefaultsChange,
  onOpenImport,
  onDownloadTemplate,
  isDownloadingTemplate,
  onOpenTemplateDialog,
  toggleableColumns,
  visibleColumnIds,
  onToggleColumn,
  onResetColumns,
  density,
  onDensityChange,
  onAddRow,
  onClearAll,
  totalRows,
  isFullscreen,
  onToggleFullscreen,
}: BulkCreateCommandBarProps) {
  const [defaultsDialogOpen, setDefaultsDialogOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  const activeDefaultsCount = [
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
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card/60 px-4 py-2 select-none text-xs">
      {/* Left controls: Project, Defaults, Import & Templates */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Project Selector */}
        <div className="w-36">
          <Select value={projectKey} onValueChange={onSelectProject}>
            <SelectTrigger className="h-8 text-xs cursor-pointer font-medium">
              <SelectValue placeholder="Chọn dự án" />
            </SelectTrigger>
            <SelectContent>
              {availableProjects.map((p) => (
                <SelectItem key={p} value={p} className="text-xs cursor-pointer">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Defaults Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDefaultsDialogOpen(true)}
          className={`h-8 gap-1.5 text-xs cursor-pointer ${
            activeDefaultsCount > 0
              ? "border-primary/50 bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Giá trị mặc định</span>
          {activeDefaultsCount > 0 && (
            <Badge variant="info" className="px-1.5 py-0 text-[10px] font-mono">
              {activeDefaultsCount}
            </Badge>
          )}
        </Button>

        <div className="h-4 w-px bg-border hidden sm:block" aria-hidden="true" />

        {/* Import CSV / Excel */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenImport}
          className="h-8 gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-primary hover:border-primary/40"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Nhập CSV / Excel</span>
          <span className="sm:hidden">Nhập file</span>
        </Button>

        {/* Download Excel Template */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDownloadTemplate}
          disabled={isDownloadingTemplate}
          title={`Tải mẫu file Excel cho dự án ${projectKey}`}
          className="h-8 gap-1.5 text-xs cursor-pointer text-teal-700 dark:text-teal-400 hover:bg-teal-500/10"
        >
          {isDownloadingTemplate ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden md:inline">Tải mẫu Excel</span>
        </Button>

        {/* Jira Template Dialog */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenTemplateDialog}
          disabled={totalRows >= MAX_BULK_CREATE_ITEMS}
          className="h-8 gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-teal-600 dark:hover:text-teal-400"
        >
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden lg:inline">Lấy task Jira làm mẫu</span>
          <span className="lg:hidden">Mẫu Jira</span>
        </Button>
      </div>

      {/* Right controls: Columns, Density, Shortcuts, Add row, Fullscreen toggle */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Column Picker */}
        <BulkCreateColumnPicker
          toggleableColumns={toggleableColumns}
          visibleColumnIds={visibleColumnIds}
          onToggleColumn={onToggleColumn}
          onResetColumns={onResetColumns}
        />

        {/* Density Switcher */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onDensityChange(density === "comfortable" ? "compact" : "comfortable")}
          title={`Mật độ hiển thị: ${density === "comfortable" ? "Thoải mái (bấm để đổi sang Nhỏ gọn)" : "Nhỏ gọn (bấm để đổi sang Thoải mái)"}`}
          className="h-8 gap-1 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">
            {density === "comfortable" ? "Thoải mái" : "Nhỏ gọn"}
          </span>
        </Button>

        {/* Shortcuts */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShortcutsDialogOpen(true)}
          title="Xem danh sách phím tắt"
          className="h-8 px-2 text-xs cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden xl:inline ml-1">Phím tắt</span>
        </Button>

        {/* Fullscreen toggle button if in standard mode */}
        {!isFullscreen && onToggleFullscreen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleFullscreen}
            className="h-8 gap-1.5 text-xs font-semibold cursor-pointer border-primary/40 text-primary hover:bg-primary/10"
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Toàn màn hình</span>
          </Button>
        )}

        <div className="h-4 w-px bg-border hidden sm:block" aria-hidden="true" />

        {/* Add Row Button */}
        <Button
          type="button"
          size="sm"
          onClick={onAddRow}
          disabled={totalRows >= MAX_BULK_CREATE_ITEMS}
          className="h-8 gap-1.5 text-xs font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Thêm dòng</span>
        </Button>

        {/* Clear All */}
        {totalRows > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            title="Làm mới bảng về 1 dòng trống"
            className="h-8 w-8 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Defaults modal */}
      <BulkCreateDefaultsDialog
        open={defaultsDialogOpen}
        onOpenChange={setDefaultsDialogOpen}
        metadata={metadata}
        projectKey={projectKey}
        defaults={defaults}
        onChange={onDefaultsChange}
      />

      {/* Shortcuts modal */}
      <BulkCreateShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </div>
  );
}
