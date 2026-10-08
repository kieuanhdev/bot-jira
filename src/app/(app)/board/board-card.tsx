"use client";

import { memo } from "react";
import { cn, timeAgo } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  User,
  Flag,
  CheckCircle2,
  Copy,
  ExternalLink,
  CornerDownLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Bot,
  GitBranch,
  CalendarClock,
} from "lucide-react";
import type { IssueItem } from "@/hooks/use-issues";
import { isOverdue } from "@/lib/due-date";
import type { QuickAction } from "./lib/board-types";
import { priorityMeta, typeShort, daysSince } from "./lib/board-utils";
import { JiraAvatar } from "@/components/jira-avatar";

export function CardContent({
  issue,
  done,
  dragging,
  onTransition,
  colIndex,
  columnCount,
  showNav,
  onQuickAction,
  assignees,
}: {
  issue: IssueItem;
  done: boolean;
  dragging?: boolean;
  onTransition?: (key: string, target: string) => void;
  colIndex?: number;
  columnCount?: number;
  showNav?: boolean;
  onQuickAction?: (key: string, action: QuickAction) => void;
  assignees?: string[];
}) {
  const stale = daysSince(issue.updatedAt) >= 7 && !done;
  const overdue = isOverdue(issue.dueDate, done);
  const pm = priorityMeta(issue.priority || "");
  const canPrev = (colIndex ?? 0) > 0;
  const canNext = (colIndex ?? 0) < (columnCount ?? 0) - 1;
  const priorities = ["Blocker", "Highest", "High", "Medium", "Low", "Lowest"];
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all duration-150",
        dragging
          ? "border-primary/50 shadow-lg ring-2 ring-primary/25"
          : "border-border/70 shadow-sm hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", pm.rail)} aria-hidden />
      <div className="py-2 pl-3.5 pr-2.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-[11px] font-medium text-muted-foreground">{issue.jiraKey}</span>
          {issue.type && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {typeShort(issue.type)}
            </span>
          )}
          <span className="ml-auto shrink-0" />
          {issue.points != null && (
            <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-secondary px-1.5 font-mono text-[10px] font-semibold tabular-nums text-secondary-foreground">
              {issue.points}
            </span>
          )}
          {onQuickAction && !dragging && (
            <DropdownMenu>
              <DropdownMenuTrigger
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                aria-label={`Actions for ${issue.jiraKey}`}
                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus:opacity-100 hover:bg-accent hover:text-foreground"
              >
                <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52" onPointerDown={(e) => e.stopPropagation()}>
                <DropdownMenuLabel className="font-mono text-xs">{issue.jiraKey}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "assignee", value: null }); }}
                    className="gap-2"
                  >
                    <User className="h-3.5 w-3.5" aria-hidden /> Unassign
                  </DropdownMenuItem>
                  {assignees && assignees.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Assign to</DropdownMenuLabel>
                      {assignees.slice(0, 12).map((a) => (
                        <DropdownMenuItem
                          key={a}
                          onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "assignee", value: a }); }}
                          className="gap-2"
                        >
                          {a === issue.assigneeJira && <span className="text-primary">•</span>}
                          <span className="truncate">{a}</span>
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Priority</DropdownMenuLabel>
                  {priorities.map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "priority", value: p }); }}
                      className="gap-2"
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden />
                      <span>{p}</span>
                      {p === issue.priority && <span className="ml-auto text-primary">•</span>}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {!done && (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "done" }); }} className="gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> Mark done
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "copyKey" }); }} className="gap-2">
                  <Copy className="h-3.5 w-3.5" aria-hidden /> Copy key
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "openJira" }); }} className="gap-2">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open in Jira
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onQuickAction(issue.jiraKey, { kind: "openFull" }); }} className="gap-2">
                  <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> Open full detail
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-card-foreground">
          {issue.summary}
        </p>

        {(issue.aiScore || stale || overdue || (issue.delivery && issue.delivery.branchCount > 0)) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {issue.delivery && issue.delivery.branchCount > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "h-4 gap-1 px-1.5 text-[10px] font-mono",
                  issue.delivery.prMerged
                    ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                    : issue.delivery.prOpen
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-muted text-muted-foreground"
                )}
                title={`${issue.delivery.branchCount} branch liên kết${issue.delivery.prMerged ? " • PR merged" : issue.delivery.prOpen ? " • PR open" : ""}`}
              >
                <GitBranch className="h-2.5 w-2.5" />
                {issue.delivery.branchCount}b
                {issue.delivery.prMerged ? " ✓" : issue.delivery.prOpen ? " PR" : ""}
              </Badge>
            )}
            {issue.aiScore && (
              <Badge
                variant={issue.aiDecision ? (issue.aiDecision.decision === "rejected" ? "danger" : "success") : "info"}
                className="h-4 gap-1 px-1.5 text-[10px]"
                title={issue.aiDecision ? `AI estimate ${issue.aiDecision.decision}` : "AI estimate (pending review)"}
              >
                <Bot className="h-2.5 w-2.5" />
                {issue.aiScore.points}pt
                {issue.aiScore.confidence != null ? ` ${Math.round(issue.aiScore.confidence * 100)}%` : ""}
              </Badge>
            )}
            {stale && (
              <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]" title="Stale — not updated in 7+ days">
                <Clock className="h-2.5 w-2.5" />
                {daysSince(issue.updatedAt)}d
              </Badge>
            )}
            {overdue && (
              <Badge variant="danger" className="h-4 gap-1 px-1.5 text-[10px]" title={`Quá hạn ${new Date(issue.dueDate!).toLocaleDateString("vi-VN")}`}>
                <CalendarClock className="h-2.5 w-2.5" aria-hidden /> Quá hạn
              </Badge>
            )}
            {issue.priority && ["Blocker", "Highest", "High"].includes(issue.priority) && (
              <span className={cn("inline-flex h-4 items-center rounded-full px-1.5 text-[10px] font-semibold", pm.badge)}>
                {issue.priority}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 flex items-center gap-1.5">
          <JiraAvatar username={issue.assigneeJira} size="sm" title={issue.assigneeJira ?? "Unassigned"} />
          <span className="truncate text-[11px] text-muted-foreground">{timeAgo(issue.updatedAt)}</span>
          {([
            ['R', issue.reporterJira, 'Reporter'],
            ['A', issue.approverJira, 'Approver'],
            ['T', issue.testerJira, 'Tester'],
          ] as const).map(([role, name, label]) => name ? (
            <JiraAvatar
              key={role}
              username={name}
              size="xs"
              className="ring-1 ring-background"
              title={`${label}: ${name}`}
              badge={role}
            />
          ) : null)}
          {showNav && onTransition && !done && (
            <span className="ml-auto flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransition(issue.jiraKey, "__prev__"); }}
                disabled={!canPrev}
                aria-label="Move to previous column"
                title="Move left"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTransition(issue.jiraKey, "__next__"); }}
                disabled={!canNext}
                aria-label="Move to next column"
                title="Move right"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:invisible"
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export const DraggableCard = memo(function DraggableCard({
  issue,
  done,
  colIndex,
  columnCount,
  onTransition,
  busy,
  dndDisabled,
  showNavButtons,
  onOpen,
  onQuickAction,
  assignees,
  registerRef,
  focused,
}: {
  issue: IssueItem;
  done: boolean;
  colIndex: number;
  columnCount: number;
  onTransition: (key: string, targetStatus: string) => void;
  busy: boolean;
  dndDisabled: boolean;
  showNavButtons: boolean;
  onOpen?: (issue: IssueItem) => void;
  onQuickAction?: (key: string, action: QuickAction) => void;
  assignees?: string[];
  registerRef?: (key: string, el: HTMLElement | null) => void;
  focused?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.jiraKey,
    disabled: dndDisabled,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        registerRef?.(issue.jiraKey, el);
      }}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative rounded-lg outline-none transition-shadow duration-150",
        !dndDisabled && !isDragging && "cursor-grab active:cursor-grabbing",
        isDragging && "z-10 opacity-40",
        focused && "ring-2 ring-ring/70 ring-offset-1 ring-offset-background"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen?.(issue)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen?.(issue);
          }
        }}
        className={cn(
          "block w-full rounded-lg text-left outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        )}
      >
        <CardContent
          issue={issue}
          done={done}
          onTransition={busy ? undefined : onTransition}
          colIndex={colIndex}
          columnCount={columnCount}
          showNav={showNavButtons && !dndDisabled}
          onQuickAction={onQuickAction}
          assignees={assignees}
        />
      </div>
    </div>
  );
});
