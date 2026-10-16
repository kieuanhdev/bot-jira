"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import type {
  BulkCreateTemplateDetailResponse,
  BulkCreateTemplateRow,
  BulkCreateTemplateSearchResponse,
} from "@/lib/contracts/bulk-create-template";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/shared/search-field";
import {
  ClipboardCopy,
  PlusCircle,
  ArrowRight,
  X,
  Layers,
} from "lucide-react";
import { TemplateIssueList } from "./template-issue-list";
import { TemplatePreview } from "./template-preview";

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
  const debouncedQuery = useDebouncedValue(searchInput.trim(), 300);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [customSummary, setCustomSummary] = useState<string | null>(null);
  const [includeParentRow, setIncludeParentRow] = useState(true);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);

  // Fetch recent or searched issues list
  const {
    data: issuesData,
    isLoading: isIssuesLoading,
    isFetching: isIssuesFetching,
  } = useQuery({
    queryKey: bulkKeys.createTemplateIssues(projectKey, debouncedQuery),
    queryFn: () =>
      api<BulkCreateTemplateSearchResponse>(
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
      api<BulkCreateTemplateDetailResponse>(
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
        const validFixed = tpl.fixVersionIds.filter((id: string) => validVersionIds.has(id));
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

  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleClose = () => {
    onOpenChange(false);
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setSearchInput("");
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
        <div className="pt-1">
          <SearchField
            placeholder={`Tìm task theo Jira key hoặc tiêu đề (vd: ${projectKey}-123 hoặc Đăng nhập)...`}
            value={searchInput}
            onChange={setSearchInput}
            onKeyDown={handleKeyDown}
            ariaLabel="Tìm task mẫu"
          />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-3 min-h-[260px] pr-1">
          {selectedKey ? (
            <TemplatePreview
              selectedKey={selectedKey}
              template={template}
              isTemplateLoading={isTemplateLoading}
              templateError={templateError}
              metadata={metadata}
              customSummary={customSummary}
              onCustomSummaryChange={setCustomSummary}
              includeParentRow={includeParentRow}
              onIncludeParentRowChange={setIncludeParentRow}
              addedMessage={addedMessage}
              onBackToList={handleBackToList}
            />
          ) : (
            <TemplateIssueList
              debouncedQuery={debouncedQuery}
              projectKey={projectKey}
              issues={issues}
              isIssuesLoading={isIssuesLoading}
              isIssuesFetching={isIssuesFetching}
              onSelectIssue={handleSelectIssue}
            />
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
