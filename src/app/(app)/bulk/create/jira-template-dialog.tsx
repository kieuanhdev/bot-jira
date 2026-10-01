"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import type { BulkCreateTemplateRow } from "@/app/api/bulk/create/templates/route";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCopy,
  Search,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  ArrowRight,
  X,
} from "lucide-react";

interface JiraTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  metadata: BulkCreateProjectMetadata;
  onAddRow: (row: BulkCreateRowInput) => void;
}

export function JiraTemplateDialog({
  open,
  onOpenChange,
  projectKey,
  metadata,
  onAddRow,
}: JiraTemplateDialogProps) {
  const [issueKeyInput, setIssueKeyInput] = useState("");
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [customSummary, setCustomSummary] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  const trimmedKey = issueKeyInput.trim().toUpperCase();
  const isValidKeyFormat = /^[A-Z][A-Z0-9_]+-\d+$/.test(trimmedKey);

  // Fetch template when user submits a key
  const {
    data: templateData,
    isLoading,
    error,
    isFetched,
  } = useQuery({
    queryKey: bulkKeys.createTemplate(projectKey, searchKey ?? ""),
    queryFn: () =>
      api<{ template: BulkCreateTemplateRow }>(
        `/api/bulk/create/templates?project=${encodeURIComponent(projectKey)}&issueKey=${encodeURIComponent(searchKey!)}`
      ),
    enabled: Boolean(searchKey),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const template = templateData?.template;

  const handleSearch = useCallback(() => {
    if (!isValidKeyFormat) return;
    setSearchKey(trimmedKey);
    setAdded(false);
    setCustomSummary(null);
  }, [trimmedKey, isValidKeyFormat]);

  const handleAddRow = useCallback(() => {
    if (!template) return;

    const row: BulkCreateRowInput = {
      clientRef: "", // Will be set by parent
      summary: customSummary ?? `${template.summary} (bản sao)`,
    };

    // Map template fields to row
    if (template.issueTypeId) {
      // Check if issue type exists in current project's metadata
      const typeExists = metadata.issueTypes.some((t) => t.id === template.issueTypeId);
      if (typeExists) {
        row.issueTypeId = template.issueTypeId;
      }
    }

    if (template.assignee) {
      row.assignee = template.assignee;
    }

    if (template.priorityId) {
      const priorityExists = metadata.priorityOptions.some((p) => p.id === template.priorityId);
      if (priorityExists) {
        row.priorityId = template.priorityId;
      }
    }

    if (template.labels && template.labels.length > 0) {
      row.labels = template.labels;
    }

    if (template.points != null) {
      row.points = template.points;
    }

    if (template.originalEstimate) {
      row.originalEstimate = template.originalEstimate;
    }

    if (template.dueDate) {
      row.dueDate = template.dueDate;
    }

    if (template.fixVersionIds && template.fixVersionIds.length > 0) {
      // Filter to only valid versions
      const validVersionIds = new Set(metadata.versionOptions.map((v) => v.id));
      const validFixed = template.fixVersionIds.filter((id) => validVersionIds.has(id));
      if (validFixed.length > 0) {
        row.fixVersionIds = validFixed;
      }
    }

    if (template.description) {
      row.description = template.description;
    }

    onAddRow(row);
    setAdded(true);
  }, [template, customSummary, metadata, onAddRow]);

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after close animation
    setTimeout(() => {
      setIssueKeyInput("");
      setSearchKey(null);
      setCustomSummary(null);
      setAdded(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ClipboardCopy className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            Lấy task Jira làm mẫu
          </DialogTitle>
          <DialogDescription className="text-xs">
            Nhập Jira key để đọc các trường và tạo dòng mới từ dữ liệu đã có. Dự án: <strong>{projectKey}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder={`vd: ${projectKey}-123`}
              value={issueKeyInput}
              onChange={(e) => setIssueKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
              className="h-10 pl-9 text-sm font-mono"
              autoFocus
            />
          </div>
          <Button
            type="button"
            onClick={handleSearch}
            disabled={!isValidKeyFormat || isLoading}
            className="h-10 px-4 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            {isLoading ? "Đang tải..." : "Tìm"}
          </Button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3 pt-2">
            <Skeleton className="h-5 w-2/3 rounded" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-5 w-1/2 rounded" />
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="space-y-1 text-xs">
              <p className="font-semibold text-foreground">Không thể đọc issue</p>
              <p className="text-muted-foreground">{getErrorMessage(error)}</p>
            </div>
          </div>
        )}

        {/* Template Preview */}
        {template && !isLoading && (
          <div className="space-y-4 pt-1">
            {/* Mapped Fields Preview */}
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  Trường được sao chép từ {searchKey}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs">
                {/* Editable Summary */}
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Tiêu đề (có thể sửa)</span>
                  <Input
                    value={customSummary ?? `${template.summary} (bản sao)`}
                    onChange={(e) => setCustomSummary(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                {/* Field badges */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {template.issueTypeName && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Loại: {template.issueTypeName}
                      {template.issueTypeId && !metadata.issueTypes.some((t) => t.id === template.issueTypeId) && (
                        <span className="ml-1 text-amber-600">⚠</span>
                      )}
                    </Badge>
                  )}
                  {template.assignee && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Assignee: {template.assigneeDisplayName || template.assignee}
                    </Badge>
                  )}
                  {template.priorityName && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Ưu tiên: {template.priorityName}
                    </Badge>
                  )}
                  {template.labels && template.labels.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      {template.labels.length} nhãn
                    </Badge>
                  )}
                  {template.points != null && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      {template.points} pts
                    </Badge>
                  )}
                  {template.originalEstimate && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Est: {template.originalEstimate}
                    </Badge>
                  )}
                  {template.dueDate && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Hạn: {template.dueDate}
                    </Badge>
                  )}
                  {template.fixVersionNames && template.fixVersionNames.length > 0 && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Ver: {template.fixVersionNames.join(", ")}
                    </Badge>
                  )}
                  {template.description && (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-normal">
                      Có mô tả
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Skipped fields warnings */}
            {template.skippedFields && template.skippedFields.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  Trường bỏ qua
                </span>
                {template.skippedFields.map((sf, i) => (
                  <div key={i} className="text-[11px] text-muted-foreground">
                    <strong className="text-foreground">{sf.field}:</strong> {sf.reason}
                  </div>
                ))}
              </div>
            )}

            {/* Sub-task warning */}
            {template.sourceIsSubtask && (
              <div className="text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Issue gốc là sub-task. Bạn cần chọn parent mới sau khi thêm.
              </div>
            )}

            {/* Success message */}
            {added && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Đã thêm dòng mới từ {searchKey}. Bạn có thể tiếp tục lấy mẫu hoặc đóng.
              </div>
            )}
          </div>
        )}

        {/* Empty state hint when no search yet */}
        {!searchKey && !isLoading && isFetched === false && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Search className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">
              Nhập Jira key ở trên để đọc task hiện có và tạo dòng mới từ dữ liệu.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="cursor-pointer text-xs"
          >
            <X className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Đóng
          </Button>
          {template && (
            <Button
              type="button"
              size="sm"
              onClick={handleAddRow}
              disabled={!(customSummary ?? template.summary)?.trim()}
              className="cursor-pointer bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-xs font-semibold gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {added ? "Thêm thêm dòng nữa" : "Thêm thành dòng mới"}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
