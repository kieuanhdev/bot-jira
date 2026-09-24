"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { DeliveryTaskRow } from "@/lib/bitbucket/task-delivery-query";
import {
  GitBranch,
  GitPullRequest,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";

type TaskDeliveryListProps = {
  tasks: DeliveryTaskRow[];
  onOpenRelink?: (jiraKey: string) => void;
};

export function TaskDeliveryList({ tasks }: TaskDeliveryListProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(tasks.slice(0, 5).map((t) => t.jiraKey))
  );

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getStatusBadge = (category: string, status: string) => {
    switch (category.toLowerCase()) {
      case "done":
        return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{status}</Badge>;
      case "indeterminate":
        return <Badge variant="secondary" className="bg-teal-500/10 text-teal-400 border-teal-500/20">{status}</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">{status}</Badge>;
    }
  };

  const getPrStateBadge = (state: string | null, merged: boolean) => {
    if (merged || state?.toUpperCase() === "MERGED") {
      return (
        <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
          MERGED
        </Badge>
      );
    }
    if (state?.toUpperCase() === "OPEN") {
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
          PR OPEN
        </Badge>
      );
    }
    if (state?.toUpperCase() === "DECLINED" || state?.toUpperCase() === "CLOSED") {
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs">
          {state.toUpperCase()}
        </Badge>
      );
    }
    return (
      <span className="text-xs text-muted-foreground italic">Chưa có PR</span>
    );
  };

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const isExpanded = expandedKeys.has(task.jiraKey);
        const hasAttention = task.attention.length > 0;

        return (
          <div
            key={task.jiraKey}
            className={`border rounded-xl bg-card transition-all ${
              hasAttention
                ? "border-amber-500/40 shadow-sm"
                : "border-border hover:border-border/80"
            }`}
          >
            {/* Task Row Header */}
            <div
              onClick={() => toggleExpand(task.jiraKey)}
              className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer select-none hover:bg-muted/30 rounded-xl"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <button
                  type="button"
                  aria-label={isExpanded ? "Collapse task" : "Expand task"}
                  className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>

                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/issue/${task.jiraKey}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono font-semibold text-teal-400 hover:underline flex items-center gap-1 text-sm"
                    >
                      {task.jiraKey}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                    {getStatusBadge(task.statusCategory, task.status)}
                    {task.assigneeJira && (
                      <span className="text-xs text-muted-foreground">
                        phụ trách: <strong className="text-foreground/80">{task.assigneeJira}</strong>
                      </span>
                    )}
                    {task.points !== null && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {task.points} pts
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-medium text-foreground line-clamp-1">
                    {task.summary}
                  </h3>
                </div>
              </div>

              {/* Delivery Stats summary */}
              <div className="flex flex-wrap items-center gap-3 pl-7 md:pl-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded">
                    <GitBranch className="w-3.5 h-3.5 text-teal-400" />
                    <span>{task.branchCount} branch</span>
                  </span>
                  {task.prSummary.open > 0 && (
                    <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded">
                      <GitPullRequest className="w-3.5 h-3.5" />
                      <span>{task.prSummary.open} open</span>
                    </span>
                  )}
                  {task.prSummary.merged > 0 && (
                    <span className="flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{task.prSummary.merged} merged</span>
                    </span>
                  )}
                </div>

                {hasAttention && (
                  <Badge variant="warning" className="bg-amber-500/10 text-amber-400 border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Cần chú ý</span>
                  </Badge>
                )}
              </div>
            </div>

            {/* Expandable Sub-Branches & Next Actions */}
            {isExpanded && (
              <div className="border-t border-border/60 bg-muted/20 px-4 py-3 space-y-3 rounded-b-xl">
                {/* Attention Alert Banner if present */}
                {hasAttention && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="space-y-1">
                      {task.attention.map((sig, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{sig.message}</span>
                        </div>
                      ))}
                    </div>
                    {task.nextActions.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground font-medium">Next action:</span>
                        {task.nextActions.map((action, i) => (
                          <span
                            key={i}
                            className="bg-card text-foreground px-2 py-1 rounded border border-border flex items-center gap-1"
                          >
                            <span>{action}</span>
                            <ArrowRight className="w-3 h-3 text-teal-400" />
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Sub-Branch Items */}
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">
                    Các nhánh liên kết ({task.branches.length})
                  </div>
                  {task.branches.map((b) => (
                    <div
                      key={b.id}
                      className="p-2.5 rounded-lg bg-card border border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {b.repo}
                        </span>
                        <span className="font-mono font-medium text-foreground truncate">
                          {b.branch}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {b.prTitle && (
                          <span className="text-muted-foreground truncate max-w-[200px]" title={b.prTitle}>
                            {b.prTitle}
                          </span>
                        )}

                        {getPrStateBadge(b.prState, b.merged)}

                        {b.prUrl && (
                          <a
                            href={b.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-teal-400 hover:underline flex items-center gap-1"
                          >
                            PR #{b.prId}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        {b.lastCommitAt && (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeAgo(b.lastCommitAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer action link to detail */}
                <div className="pt-1 flex justify-end">
                  <Link
                    href={`/issue/${task.jiraKey}`}
                    className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1 font-medium"
                  >
                    Mở chi tiết Jira Task & Quản lý nhánh
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
