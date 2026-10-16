"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Clock, GitBranch, ArrowRight, Loader2 } from "lucide-react";
import type { BulkCreateTemplateIssueItem } from "@/lib/contracts/bulk-create-template";

export interface TemplateIssueListProps {
  debouncedQuery: string;
  projectKey: string;
  issues: BulkCreateTemplateIssueItem[];
  isIssuesLoading: boolean;
  isIssuesFetching: boolean;
  onSelectIssue: (issueKey: string) => void;
}

export function TemplateIssueList({
  debouncedQuery,
  projectKey,
  issues,
  isIssuesLoading,
  isIssuesFetching,
  onSelectIssue,
}: TemplateIssueListProps) {
  return (
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
              onClick={() => onSelectIssue(issue.key)}
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
  );
}
