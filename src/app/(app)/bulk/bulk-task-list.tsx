"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import type { IssueItem } from "@/hooks/use-issues";
import { cn } from "@/lib/utils";
import { getJiraIssueUrl } from "@/lib/jira/urls";
import { Clock, ExternalLink, Search } from "lucide-react";
import { useWindowedRows } from "@/hooks/use-windowed-rows";
import type { SelectionMode } from "./lib/bulk-logic";
import { CATEGORY_TEXT } from "./lib/bulk-types";
import { categoryOf, statusDot } from "./lib/bulk-utils";

export interface BulkTaskRowProps {
  issue: IssueItem;
  isChecked: boolean;
  isStandardizing: boolean;
  selectionMode: SelectionMode;
  jiraBaseUrl: string;
  onToggle: (key: string) => void;
}

export const BulkTaskRow = memo(function BulkTaskRow({
  issue: i,
  isChecked,
  isStandardizing,
  selectionMode,
  jiraBaseUrl,
  onToggle,
}: BulkTaskRowProps) {
  const cat = categoryOf(i.status, i.statusCategory);
  const dot = statusDot(i.status, cat);

  return (
    <label
      data-row
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-l-[3px] px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
        cat === "new" && "border-l-info/60",
        cat === "indeterminate" && "border-l-primary/60",
        cat === "done" && "border-l-success/60",
        isChecked && "bg-accent/40",
        isStandardizing && "bg-primary-soft/40"
      )}
    >
      <Checkbox
        checked={isChecked}
        disabled={selectionMode === "filter"}
        onCheckedChange={() => onToggle(i.jiraKey)}
        aria-label={`Chọn ${i.jiraKey}`}
      />
      {jiraBaseUrl ? (
        <a
          href={getJiraIssueUrl(jiraBaseUrl, i.jiraKey) ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="group/link inline-flex w-24 shrink-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
          title={`Mở ${i.jiraKey} trên Jira`}
        >
          {i.jiraKey}
          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden="true" />
        </a>
      ) : (
        <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
      )}
      {isStandardizing && (
        <Badge
          variant="secondary"
          className="text-2xs py-0.5 px-2 shrink-0 font-medium bg-primary-soft text-primary-soft-foreground border border-primary/20"
        >
          Chuẩn hóa
        </Badge>
      )}
      <span className="min-w-0 flex-1 truncate">{i.summary}</span>
      {i.epic && (
        <span
          className="hidden sm:inline-flex shrink-0 items-center rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-2xs font-medium text-primary"
          title={`Epic: ${i.epic}`}
        >
          {i.epic}
        </span>
      )}
      {i.createdAt && (
        <span
          className="hidden md:inline-flex shrink-0 items-center text-xs text-muted-foreground tabular-nums"
          title={`Ngày tạo: ${new Date(i.createdAt).toLocaleString("vi-VN")}`}
        >
          <Clock className="h-3 w-3 mr-1 opacity-60" aria-hidden="true" />
          {new Date(i.createdAt).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
      )}
      <span
        className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground max-w-[130px] truncate"
        title={i.assigneeJira ? `Người phụ trách: @${i.assigneeJira}` : "Chưa giao"}
      >
        {i.assigneeJira ? `@${i.assigneeJira}` : "Chưa giao"}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden="true" />
        <span className={CATEGORY_TEXT[cat]}>{i.status}</span>
      </span>
      {i.points != null && (
        <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 font-mono text-2xs font-semibold tabular-nums text-secondary-foreground">
          {i.points}pt
        </span>
      )}
    </label>
  );
});

export interface BulkTaskListProps {
  isIssuesLoading: boolean;
  filteredIssues: IssueItem[];
  selectionMode: SelectionMode;
  selected: Set<string>;
  initialKeysSet: Set<string>;
  jiraBaseUrl: string;
  onToggle: (key: string) => void;
}

export function BulkTaskList({
  isIssuesLoading,
  filteredIssues,
  selectionMode,
  selected,
  initialKeysSet,
  jiraBaseUrl,
  onToggle,
}: BulkTaskListProps) {
  const { scrollRef, windowed, startIdx, endIdx, padTop, padBottom } = useWindowedRows({
    totalRows: filteredIssues.length,
    rowHeight: 41,
    overscan: 10,
    threshold: 60,
  });

  const visibleIssues = windowed ? filteredIssues.slice(startIdx, endIdx) : filteredIssues;

  return (
    <div ref={scrollRef} className="max-h-80 overflow-auto">
      {isIssuesLoading && (
        <div className="flex flex-col gap-2 p-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}
      {padTop > 0 && <div style={{ height: padTop }} aria-hidden="true" />}
      {visibleIssues.map((i) => (
        <BulkTaskRow
          key={i.jiraKey}
          issue={i}
          isChecked={selectionMode === "filter" || selected.has(i.jiraKey)}
          isStandardizing={initialKeysSet.has(i.jiraKey)}
          selectionMode={selectionMode}
          jiraBaseUrl={jiraBaseUrl}
          onToggle={onToggle}
        />
      ))}
      {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden="true" />}
      {!isIssuesLoading && filteredIssues.length === 0 && (
        <div className="flex flex-col items-center p-10 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium">Không tìm thấy task phù hợp</p>
          <p className="mt-1 text-xs text-muted-foreground">Xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái/người phụ trách khác.</p>
        </div>
      )}
    </div>
  );
}
