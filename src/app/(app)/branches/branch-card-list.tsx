"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";
import {
  GitPullRequest,
  ChevronRight,
  User,
  AlertTriangle,
  Link2,
} from "lucide-react";
import type { BranchRowItem } from "./branch-types";

type BranchCardListProps = {
  items: BranchRowItem[];
  onSelectBranch: (branch: BranchRowItem) => void;
  onOpenLinkDialog: (branch: BranchRowItem) => void;
};

export function BranchCardList({ items, onSelectBranch, onOpenLinkDialog }: BranchCardListProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((row) => {
        const hasTask = Boolean(row.task);
        const isSuggested = !row.jiraKey && Boolean(row.suggestedJiraKey);
        const highRiskSignal = row.attentionSignals.find((s) => s.severity === "high");
        const mediumRiskSignal = row.attentionSignals.find((s) => s.severity === "medium");
        const primarySignal = highRiskSignal ?? mediumRiskSignal ?? row.attentionSignals[0];

        return (
          <Card
            key={row.id}
            tabIndex={0}
            role="button"
            onClick={() => onSelectBranch(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectBranch(row);
              }
            }}
            className="cursor-pointer border border-border bg-card p-3.5 transition-colors hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {/* Top row: Jira Task or Link Status */}
            <div className="flex items-start justify-between gap-2">
              {hasTask && row.task ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/issue/${row.task.jiraKey}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {row.task.jiraKey}
                    </Link>
                    <Badge
                      variant={
                        row.task.statusCategory === "done"
                          ? "success"
                          : row.task.statusCategory === "indeterminate"
                          ? "info"
                          : "outline"
                      }
                      className="h-4 px-1.5 text-[10px]"
                    >
                      {row.task.status}
                    </Badge>
                  </div>
                  <span className="line-clamp-1 text-xs font-medium text-foreground">
                    {row.task.summary}
                  </span>
                </div>
              ) : isSuggested ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Link2 className="h-3.5 w-3.5" />
                    <span className="font-mono font-semibold">Gợi ý: {row.suggestedJiraKey}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenLinkDialog(row);
                    }}
                    className="h-6 border-amber-500/30 px-2 text-[10px] text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
                  >
                    Xác nhận
                  </Button>
                </div>
              ) : (
                <span className="text-xs italic text-muted-foreground">Chưa gắn task</span>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBranch(row);
                }}
                className="h-7 w-7 p-0 text-muted-foreground"
                aria-label="Chi tiết nhánh"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Middle: Branch & Repo */}
            <div className="mt-2.5 flex flex-col gap-0.5 rounded bg-muted/40 p-2 font-mono text-xs">
              <span className="truncate font-medium text-foreground">{row.branch}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {row.repo}
                {row.prDestinationBranch ? ` → ${row.prDestinationBranch}` : ""}
              </span>
            </div>

            {/* Bottom: PR status & Activity & Attention */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                {row.prState ? (
                  <div className="flex items-center gap-1">
                    <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>#{row.prId}</span>
                    <Badge
                      variant={
                        row.prState === "OPEN"
                          ? "info"
                          : row.prState === "MERGED"
                          ? "success"
                          : row.prState === "DECLINED"
                          ? "danger"
                          : "outline"
                      }
                      className="h-4 px-1 text-[10px]"
                    >
                      {row.prState === "OPEN"
                        ? "Đang mở"
                        : row.prState === "MERGED"
                        ? "Đã gộp"
                        : row.prState === "DECLINED"
                        ? "Bị từ chối"
                        : row.prState}
                    </Badge>
                  </div>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Không có PR</span>
                )}

                <span className="text-muted-foreground/60">•</span>
                <span className="text-[11px] text-muted-foreground">
                  {row.prUpdatedAt ? timeAgo(row.prUpdatedAt) : timeAgo(row.checkedAt)}
                </span>
              </div>

              {row.task?.assigneeJira && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>{row.task.assigneeJira}</span>
                </div>
              )}
            </div>

            {/* Attention Alert if any */}
            {primarySignal && primarySignal.rule !== "unlinked" && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2 text-[11px]">
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 ${
                    primarySignal.severity === "high"
                      ? "text-red-500"
                      : primarySignal.severity === "medium"
                      ? "text-amber-500"
                      : "text-sky-500"
                  }`}
                />
                <span className="truncate font-medium text-foreground">{primarySignal.message}</span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
