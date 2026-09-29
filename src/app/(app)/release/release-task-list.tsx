"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  GitBranch,
  GitPullRequest,
  Sparkles,
  ExternalLink,
  Clock,
  Ban,
  User,
} from "lucide-react";
import type { TaskReadinessResult, ReleaseBlocker } from "@/lib/releases/release-readiness";

interface ReleaseTaskListProps {
  tasks: TaskReadinessResult[];
  jiraBaseUrl?: string;
}

export function ReleaseTaskList({ tasks, jiraBaseUrl }: ReleaseTaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm flex flex-col items-center justify-center">
        <div className="p-3 rounded-full bg-muted/40 mb-2">
          <Ban className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-medium text-foreground">Chưa có task nào thuộc phiên bản này</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Gán Fix Version cho issue trên Jira và bấm &quot;Đồng bộ từ Jira&quot; để nạp task.
        </p>
      </div>
    );
  }

  // Sort tasks: incomplete/blocked first, then done
  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.ready === b.ready) return a.jiraKey.localeCompare(b.jiraKey);
    return a.ready ? 1 : -1;
  });

  return (
    <div className="divide-y divide-border rounded-md border border-border bg-card overflow-hidden">
      {sortedTasks.map((t) => {
        const isDone = t.isDone;
        const isGitComplete = t.gitComplete;
        const primaryBranch = t.branches.find((b) => b.linkState === "confirmed") || t.branches[0];

        return (
          <div
            key={t.jiraKey}
            className={`p-3.5 transition-colors hover:bg-muted/20 ${
              !t.ready ? "bg-amber-500/5" : ""
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {t.ready ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" aria-hidden="true" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/issue/${t.jiraKey}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {t.jiraKey}
                    </Link>

                    {jiraBaseUrl && (
                      <a
                        href={`${jiraBaseUrl}/browse/${t.jiraKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center"
                        title="Xem trên Jira"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}

                    <span className="text-xs font-medium text-foreground truncate max-w-[320px] sm:max-w-[450px]">
                      {t.summary}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                    {t.assignee && (
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span>{t.assignee}</span>
                      </span>
                    )}

                    {t.points != null && (
                      <span className="inline-flex items-center gap-0.5 bg-muted/60 px-1.5 py-0.2 rounded text-[10px] font-mono">
                        {t.points} pts
                      </span>
                    )}

                    {t.priority && (
                      <span className="text-[10px] text-muted-foreground">
                        {t.priority}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and Git indicators */}
              <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                {/* Jira Status Category */}
                <Badge
                  variant="outline"
                  className={`text-[11px] font-medium ${
                    isDone
                      ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                      : "border-amber-500/30 text-amber-500 bg-amber-500/10"
                  }`}
                >
                  {t.status || (isDone ? "Done" : "In Progress")}
                </Badge>

                {/* Git Status Badge */}
                {t.noCode ? (
                  <Badge variant="secondary" className="text-[11px] gap-1 bg-muted text-muted-foreground">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Không cần code
                  </Badge>
                ) : isGitComplete ? (
                  <Badge variant="outline" className="text-[11px] gap-1 border-teal-500/30 text-teal-500 bg-teal-500/10">
                    <GitPullRequest className="h-3 w-3" aria-hidden="true" />
                    PR đã merge
                  </Badge>
                ) : (
                  renderGitPendingBadge(t.blockers)
                )}
              </div>
            </div>

            {/* Blockers explanation if any */}
            {t.blockers.length > 0 && (
              <div className="mt-2 ml-7 sm:ml-7 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded p-2 flex flex-col gap-1">
                {t.blockers.map((b, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{formatBlockerMessage(b)}</span>
                    {b.prUrl && (
                      <a
                        href={b.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline inline-flex items-center gap-0.5 ml-1"
                      >
                        Xem PR <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Branch and PR reference */}
            {primaryBranch && !t.noCode && (
              <div className="mt-1.5 ml-7 text-[11px] text-muted-foreground flex items-center gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                  <GitBranch className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  {primaryBranch.repo} / {primaryBranch.branch}
                </span>
                {primaryBranch.prUrl && (
                  <a
                    href={primaryBranch.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    PR #{primaryBranch.prId} ({primaryBranch.prState})
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderGitPendingBadge(blockers: ReleaseBlocker[]) {
  const codes = new Set(blockers.map((b) => b.code));

  if (codes.has("NO_CONFIRMED_BRANCH")) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-rose-500/30 text-rose-500 bg-rose-500/10">
        <GitBranch className="h-3 w-3" aria-hidden="true" />
        Chưa có branch
      </Badge>
    );
  }

  if (codes.has("BRANCH_LINK_UNCONFIRMED")) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10">
        <GitBranch className="h-3 w-3" aria-hidden="true" />
        Chờ xác nhận branch
      </Badge>
    );
  }

  if (codes.has("NO_PULL_REQUEST")) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10">
        <GitPullRequest className="h-3 w-3" aria-hidden="true" />
        Chưa tạo PR
      </Badge>
    );
  }

  if (codes.has("PR_NOT_MERGED")) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-amber-500/30 text-amber-500 bg-amber-500/10">
        <GitPullRequest className="h-3 w-3" aria-hidden="true" />
        PR chưa merge
      </Badge>
    );
  }

  if (codes.has("WRONG_MERGE_DESTINATION")) {
    return (
      <Badge variant="outline" className="text-[11px] gap-1 border-destructive/30 text-destructive bg-destructive/10">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Sai branch đích
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[11px] gap-1 border-muted-foreground/30 text-muted-foreground">
      <GitBranch className="h-3 w-3" aria-hidden="true" />
      Chưa hoàn tất Git
    </Badge>
  );
}

function formatBlockerMessage(blocker: ReleaseBlocker): string {
  switch (blocker.code) {
    case "TASK_NOT_DONE":
      return `Trạng thái Jira "${blocker.status}" chưa thuộc nhóm Done.`;
    case "NO_CONFIRMED_BRANCH":
      return "Task cần code nhưng chưa có branch nào được xác nhận liên kết.";
    case "BRANCH_LINK_UNCONFIRMED":
      return `Branch ${blocker.repo}/${blocker.branch} đang là gợi ý, chưa được xác nhận liên kết.`;
    case "NO_PULL_REQUEST":
      return `Branch ${blocker.repo}/${blocker.branch} chưa có Pull Request.`;
    case "PR_NOT_MERGED":
      return `Pull Request trên ${blocker.repo}/${blocker.branch} chưa được merge.`;
    case "WRONG_MERGE_DESTINATION":
      return `PR trên ${blocker.repo}/${blocker.branch} không merge vào branch đích cho phép.`;
    case "GIT_DATA_STALE":
      return "Dữ liệu Git chưa được làm mới hoặc đã quá cũ.";
    case "GIT_UNAVAILABLE":
      return "Không thể kết nối Bitbucket để xác thực trạng thái merge.";
    default:
      return blocker.reason || blocker.code;
  }
}
