"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import type {
  BulkCreateTemplateRow,
  BulkCreateTemplateIssueItem,
} from "@/app/api/bulk/create/templates/route";
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
  PlusCircle,
  ArrowRight,
  ArrowLeft,
  X,
  Clock,
  GitBranch,
  Layers,
  Loader2,
} from "lucide-react";

interface JiraTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectKey: string;
  metadata: BulkCreateProjectMetadata;
  onAddRow: (row: BulkCreateRowInput | BulkCreateRowInput[]) => void;
}

export function JiraTemplateDialog({
  open,
  onOpenChange,
  projectKey,
  metadata,
  onAddRow,
}: JiraTemplateDialogProps) {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [customSummary, setCustomSummary] = useState<string | null>(null);
  const [includeParentRow, setIncludeParentRow] = useState(true);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounce search query
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchInput]);

  // Fetch recent or searched issues list
  const {
    data: issuesData,
    isLoading: isIssuesLoading,
    isFetching: isIssuesFetching,
  } = useQuery({
    queryKey: bulkKeys.createTemplateIssues(projectKey, debouncedQuery),
    queryFn: () =>
      api<{ issues: BulkCreateTemplateIssueItem[] }>(
        `/api/bulk/create/templates?project=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(debouncedQuery)}&limit=15`
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const issues = issuesData?.issues ?? [];

  // Fetch single template details when an issue is selected
  const {
    data: templateData,
    isLoading: isTemplateLoading,
    error: templateError,
  } = useQuery({
    queryKey: bulkKeys.createTemplate(projectKey, selectedKey ?? ""),
    queryFn: () =>
      api<{ template: BulkCreateTemplateRow }>(
        `/api/bulk/create/templates?project=${encodeURIComponent(projectKey)}&issueKey=${encodeURIComponent(selectedKey!)}`
      ),
    enabled: Boolean(selectedKey),
    staleTime: 2 * 60 * 1000,
    retry: false,
  });

  const template = templateData?.template;

  const handleSelectIssue = useCallback((key: string) => {
    setSelectedKey(key);
    setCustomSummary(null);
    setAddedMessage(null);
    setIncludeParentRow(true);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedKey(null);
    setCustomSummary(null);
    setAddedMessage(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = searchInput.trim().toUpperCase();
      if (/^[A-Z][A-Z0-9_]+-\d+$/.test(trimmed)) {
        handleSelectIssue(trimmed);
      } else if (issues.length > 0) {
        handleSelectIssue(issues[0].key);
      }
    }
  };

  const handleAddRow = useCallback(() => {
    if (!template) return;

    // Helper to map template fields to row
    const mapFieldsToRow = (
      tpl: BulkCreateTemplateRow,
      summaryText: string,
      clientRef: string,
      isSubtask: boolean,
      parentRef?: BulkCreateRowInput["parent"]
    ): BulkCreateRowInput => {
      const row: BulkCreateRowInput = {
        clientRef,
        summary: summaryText,
      };

      if (parentRef) {
        row.parent = parentRef;
      }

      if (tpl.issueTypeId) {
        const typeExists = metadata.issueTypes.some((t) => t.id === tpl.issueTypeId);
        if (typeExists) {
          row.issueTypeId = tpl.issueTypeId;
        }
      }

      if (!row.issueTypeId && isSubtask) {
        // Fallback to first available subtask type if specified type doesn't exist
        const subType = metadata.issueTypes.find((t) => t.subtask);
        if (subType) row.issueTypeId = subType.id;
      }

      if (tpl.assignee) {
        row.assignee = tpl.assignee;
      }

      if (tpl.priorityId) {
        const priorityExists = metadata.priorityOptions.some((p) => p.id === tpl.priorityId);
        if (priorityExists) {
          row.priorityId = tpl.priorityId;
        }
      }

      if (tpl.labels && tpl.labels.length > 0) {
        row.labels = tpl.labels;
      }

      if (tpl.points != null) {
        row.points = tpl.points;
      }

      if (tpl.originalEstimate) {
        row.originalEstimate = tpl.originalEstimate;
      }

      if (tpl.dueDate) {
        row.dueDate = tpl.dueDate;
      }

      if (tpl.fixVersionIds && tpl.fixVersionIds.length > 0) {
        const validVersionIds = new Set(metadata.versionOptions.map((v) => v.id));
        const validFixed = tpl.fixVersionIds.filter((id) => validVersionIds.has(id));
        if (validFixed.length > 0) {
          row.fixVersionIds = validFixed;
        }
      }

      if (tpl.description) {
        row.description = tpl.description;
      }

      return row;
    };

    const subSummary = customSummary ?? `${template.summary} (bản sao)`;

    if (template.sourceIsSubtask && includeParentRow && template.parentKey) {
      // Create both parent row and subtask row
      const parentRefPlaceholder = `tpl-p-${Date.now()}`;
      const subtaskRefPlaceholder = `tpl-s-${Date.now()}`;

      let parentRow: BulkCreateRowInput;
      if (template.parentTemplate) {
        const pSummary = `${template.parentTemplate.summary} (bản sao)`;
        parentRow = mapFieldsToRow(
          template.parentTemplate,
          pSummary,
          parentRefPlaceholder,
          false
        );
      } else {
        const pSummary = template.parentSummary
          ? `${template.parentSummary} (bản sao)`
          : `${template.parentKey} (bản sao)`;
        parentRow = {
          clientRef: parentRefPlaceholder,
          summary: pSummary,
        };
        if (template.parentIssueTypeId) {
          const typeExists = metadata.issueTypes.some((t) => t.id === template.parentIssueTypeId);
          if (typeExists) parentRow.issueTypeId = template.parentIssueTypeId;
        }
        if (!parentRow.issueTypeId) {
          const nonSub = metadata.issueTypes.find((t) => !t.subtask);
          if (nonSub) parentRow.issueTypeId = nonSub.id;
        }
      }

      const subtaskRow = mapFieldsToRow(
        template,
        subSummary,
        subtaskRefPlaceholder,
        true,
        { type: "batch", clientRef: parentRefPlaceholder }
      );

      onAddRow([parentRow, subtaskRow]);
      setAddedMessage(
        `Đã thêm 2 dòng: task cha (${template.parentKey}) và sub-task (${selectedKey}).`
      );
    } else {
      // Create single subtask or standard issue row
      const parentRef =
        template.sourceIsSubtask && template.parentKey
          ? { type: "jira" as const, jiraKey: template.parentKey }
          : null;

      const row = mapFieldsToRow(
        template,
        subSummary,
        "",
        Boolean(template.sourceIsSubtask),
        parentRef
      );

      onAddRow(row);
      setAddedMessage(
        template.sourceIsSubtask && template.parentKey
          ? `Đã thêm dòng mới từ ${selectedKey} (đã gán task cha ${template.parentKey}).`
          : `Đã thêm dòng mới từ ${selectedKey}.`
      );
    }
  }, [template, customSummary, includeParentRow, selectedKey, metadata, onAddRow]);

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSearchInput("");
      setDebouncedQuery("");
      setSelectedKey(null);
      setCustomSummary(null);
      setAddedMessage(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl sm:max-w-2xl max-h-[88vh] flex flex-col p-6">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ClipboardCopy className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              Lấy task Jira làm mẫu
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Chọn task từ danh sách gần đây hoặc tìm kiếm theo key / tiêu đề. Dự án: <strong>{projectKey}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Live Search Input */}
        <div className="relative pt-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={`Tìm task theo Jira key hoặc tiêu đề (vd: ${projectKey}-123 hoặc Đăng nhập)...`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-10 pl-9 pr-8 text-sm"
            autoFocus
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setDebouncedQuery("");
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Xóa tìm kiếm"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-[260px] pr-1">
          {selectedKey ? (
            /* Selected Template Preview */
            <div className="space-y-4 pt-1">
              <div className="flex items-center justify-between pb-1 border-b border-border">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToList}
                  className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Quay lại danh sách task
                </Button>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Đang xem mẫu:</span>
                  <Badge variant="secondary" className="font-mono text-xs font-semibold px-2 py-0.5">
                    {selectedKey}
                  </Badge>
                </div>
              </div>

              {/* Template Loading State */}
              {isTemplateLoading && (
                <div className="space-y-3 pt-2">
                  <Skeleton className="h-5 w-2/3 rounded" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>
              )}

              {/* Template Error State */}
              {templateError && !isTemplateLoading && (
                <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-foreground">Không thể đọc issue {selectedKey}</p>
                    <p className="text-muted-foreground">{getErrorMessage(templateError)}</p>
                  </div>
                </div>
              )}

              {/* Template Loaded Content */}
              {template && !isTemplateLoading && (
                <div className="space-y-3.5">
                  {/* Sub-task & Parent Box */}
                  {template.sourceIsSubtask && (
                    <div className="rounded-lg border border-teal-500/30 bg-teal-500/5 dark:bg-teal-950/20 p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <GitBranch className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                            Issue này là Sub-task của task cha:
                            {template.parentKey ? (
                              <Badge variant="outline" className="font-mono font-semibold text-teal-700 dark:text-teal-300 border-teal-500/40">
                                {template.parentKey}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic">(Chưa rõ key cha)</span>
                            )}
                          </p>
                          {template.parentSummary && (
                            <p className="text-muted-foreground text-[11px] line-clamp-2">
                              {template.parentSummary}
                            </p>
                          )}
                        </div>
                      </div>

                      {template.parentKey && (
                        <div className="pt-1.5 border-t border-teal-500/20">
                          <label className="flex items-start gap-2.5 cursor-pointer text-xs select-none">
                            <input
                              type="checkbox"
                              checked={includeParentRow}
                              onChange={(e) => setIncludeParentRow(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-border text-teal-600 focus:ring-teal-500"
                            />
                            <div className="space-y-0.5">
                              <span className="font-semibold text-foreground">
                                Thêm cả task cha ({template.parentKey}) vào danh sách tạo mới
                              </span>
                              <p className="text-[11px] text-muted-foreground">
                                {includeParentRow
                                  ? "Hệ thống sẽ thêm 2 dòng: task cha mới và sub-task này liên kết với task cha trong cùng batch."
                                  : `Chỉ thêm 1 dòng sub-task, tự động gán vào task cha có sẵn ${template.parentKey} trên Jira.`}
                              </p>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary & Mapped Fields Preview */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3.5 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                        Trường được sao chép từ {selectedKey}
                      </span>
                    </div>

                    {/* Editable Summary */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Tiêu đề dòng mới (có thể chỉnh sửa):
                      </label>
                      <Input
                        value={customSummary ?? `${template.summary} (bản sao)`}
                        onChange={(e) => setCustomSummary(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>

                    {/* Field Badges */}
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

                  {/* Skipped fields warnings if any */}
                  {template.skippedFields && template.skippedFields.length > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1 text-xs">
                      <span className="text-[11px] font-semibold text-foreground">Trường bỏ qua</span>
                      {template.skippedFields.map((sf, i) => (
                        <div key={i} className="text-[11px] text-muted-foreground">
                          <strong className="text-foreground">{sf.field}:</strong> {sf.reason}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Success notification */}
                  {addedMessage && (
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {addedMessage}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Issues List (Recent or Searched) */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground px-0.5">
                <span className="flex items-center gap-1.5 font-medium">
                  {debouncedQuery ? (
                    <>
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      Kết quả tìm kiếm cho &ldquo;{debouncedQuery}&rdquo; ({issues.length})
                    </>
                  ) : (
                    <>
                      <Clock className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                      Task gần đây trong dự án {projectKey} ({issues.length})
                    </>
                  )}
                </span>
                {isIssuesFetching && (
                  <span className="flex items-center gap-1 text-[11px] text-teal-600 dark:text-teal-400">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    Đang tìm...
                  </span>
                )}
              </div>

              {/* Loading Skeletons */}
              {isIssuesLoading && (
                <div className="space-y-2 pt-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-24 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                      </div>
                      <Skeleton className="h-4 w-4/5 rounded" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state when no issues found */}
              {!isIssuesLoading && issues.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Search className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">Không tìm thấy task phù hợp</p>
                  <p className="text-[11px] text-muted-foreground max-w-sm">
                    {debouncedQuery
                      ? `Không có task nào khớp với "${debouncedQuery}" trong dự án ${projectKey}. Bạn có thể nhập trực tiếp mã task đầy đủ (vd: ${projectKey}-123).`
                      : `Dự án ${projectKey} hiện chưa có task nào gần đây.`}
                  </p>
                </div>
              )}

              {/* Issues items */}
              {!isIssuesLoading && issues.length > 0 && (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {issues.map((issue) => (
                    <button
                      key={issue.key}
                      type="button"
                      onClick={() => handleSelectIssue(issue.key)}
                      className="w-full text-left p-3 hover:bg-accent/50 transition-colors duration-150 flex items-start justify-between gap-3 cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 group-hover:underline">
                            {issue.key}
                          </span>
                          <Badge
                            variant={issue.isSubtask ? "secondary" : "outline"}
                            className="text-[10px] px-1.5 py-0 font-normal"
                          >
                            {issue.issueTypeName}
                          </Badge>
                          {issue.status && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground">
                              {issue.status}
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs font-medium text-foreground line-clamp-1">
                          {issue.summary || "(Không có tiêu đề)"}
                        </p>

                        {issue.isSubtask && issue.parentKey && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                            <GitBranch className="h-3 w-3 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                            Task cha: {issue.parentKey}
                            {issue.parentSummary ? ` (${issue.parentSummary})` : ""}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center gap-1 pt-1 text-muted-foreground group-hover:text-foreground">
                        <span className="text-[11px] hidden sm:inline">Chọn mẫu</span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dialog Footer */}
        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-border">
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

          {template && selectedKey && (
            <Button
              type="button"
              size="sm"
              onClick={handleAddRow}
              disabled={!(customSummary ?? template.summary)?.trim() || isTemplateLoading}
              className="cursor-pointer bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-xs font-semibold gap-1.5"
            >
              {template.sourceIsSubtask && includeParentRow ? (
                <>
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  Thêm cả task cha &amp; sub-task (2 dòng)
                </>
              ) : template.sourceIsSubtask && template.parentKey ? (
                <>
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Thêm sub-task (gán parent {template.parentKey})
                </>
              ) : (
                <>
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Thêm thành dòng mới
                </>
              )}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
