import {
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  GitBranch,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatJiraDuration } from "@/lib/worklogs/schema";
import { timeAgo } from "@/lib/utils";
import type { IssueDetail, Transition, BranchRow } from "./lib/issue-detail-types";
import { transitionTo } from "./lib/issue-detail-utils";

interface IssueDetailHeaderProps {
  issue: IssueDetail;
  jiraUrl: string | null;
  primaryBranch?: BranchRow;
  primaryBranchUrl: string | null;
  watched: boolean;
  busy: boolean;
  transitions: Transition[];
  onToggleWatch: () => void;
  onTransition: (t: Transition) => void;
}

export function IssueDetailHeader({
  issue,
  jiraUrl,
  primaryBranch,
  primaryBranchUrl,
  watched,
  busy,
  transitions,
  onToggleWatch,
  onTransition,
}: IssueDetailHeaderProps) {
  const stale = issue.staleSnapshots?.[0];

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          {jiraUrl ? (
            <a
              href={jiraUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              title="Mở xem trên Jira"
            >
              <span>{issue.jiraKey}</span>
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          ) : (
            <span className="font-mono text-sm text-muted-foreground">{issue.jiraKey}</span>
          )}
          <Badge>{issue.status}</Badge>
          {issue.points != null && <Badge variant="secondary">{issue.points} điểm</Badge>}
          {issue.timeSpentSeconds != null && issue.timeSpentSeconds > 0 && (
            <Badge variant="outline" className="gap-1 text-xs font-mono">
              <Clock className="h-3 w-3 text-teal-600 dark:text-teal-400" />
              {formatJiraDuration(issue.timeSpentSeconds)}
            </Badge>
          )}
          {stale && (
            <Badge variant={stale.severity === "high" ? "danger" : stale.severity === "info" ? "info" : "warning"}>
              {(stale.staleReason ? stale.staleReason.replace(/_/g, " ") : "stale")} · {stale.stateAgeDays ?? 0} ngày
            </Badge>
          )}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{issue.summary}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{issue.type}</span>
          {issue.priority && <span>· {issue.priority}</span>}
          {issue.assigneeJira && <span>· {issue.assigneeJira}</span>}
          <span>· cập nhật {timeAgo(issue.updatedAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {jiraUrl && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 cursor-pointer text-xs font-semibold"
            title="Mở xem trên Jira"
          >
            <a href={jiraUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Xem trên Jira</span>
            </a>
          </Button>
        )}
        {primaryBranchUrl && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="gap-1.5 cursor-pointer text-xs font-semibold border-teal-500/30 text-teal-600 dark:text-teal-400 bg-teal-500/5 hover:bg-teal-500/10"
            title={`Mở nhánh ${primaryBranch?.branch} trên Git`}
          >
            <a href={primaryBranchUrl} target="_blank" rel="noreferrer">
              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="max-w-[130px] truncate">{primaryBranch?.branch}</span>
              <ExternalLink className="h-3 w-3 opacity-60" aria-hidden="true" />
            </a>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={onToggleWatch}
          className="gap-1.5"
        >
          {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {watched ? "Đang theo dõi" : "Theo dõi"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="sm" disabled={busy || !transitions.length}>
              <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              Chuyển sang…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>Chuyển trạng thái</DropdownMenuLabel>
            {transitions.map((t) => (
              <DropdownMenuItem key={t.id} disabled={busy} onClick={() => onTransition(t)}>
                {transitionTo(t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
