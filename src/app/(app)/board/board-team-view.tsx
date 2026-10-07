"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, UserRound, BarChart3, Clock3 } from "lucide-react";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardColumn } from "./lib/board-columns";
import { CardContent } from "./board-card";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/due-date";

export function BoardTeamView({
  issues,
  columns,
  findColumn,
  onOpen,
  onSelectAssignee,
  projectKey,
}: {
  issues: IssueItem[];
  columns: BoardColumn[];
  findColumn: (issue: IssueItem) => string;
  onOpen: (issue: IssueItem) => void;
  onSelectAssignee: (assignee: string | null) => void;
  projectKey: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const lanes = useMemo(() => {
    const map = new Map<string, IssueItem[]>();
    for (const issue of issues) {
      const key = issue.assigneeJira ?? "__unassigned__";
      map.set(key, [...(map.get(key) ?? []), issue]);
    }
    return [...map.entries()].sort(([a], [b]) => a === "__unassigned__" ? 1 : b === "__unassigned__" ? -1 : a.localeCompare(b));
  }, [issues]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto rounded-lg border bg-muted/10 p-2">
      <div className="flex flex-wrap gap-2" aria-label="Khối lượng công việc">
        {lanes.map(([assignee, items]) => {
          const overdue = items.filter((item) => isOverdue(item.dueDate, item.statusCategory === "done")).length;
          const points = items.reduce((sum, item) => sum + (item.points ?? 0), 0);
          return (
            <button key={assignee} type="button" onClick={() => onSelectAssignee(assignee === "__unassigned__" ? null : assignee)} className="cursor-pointer rounded-full border bg-card px-3 py-1.5 text-xs transition-colors hover:border-primary/50 hover:bg-primary/5">
              <span className="font-medium">{assignee === "__unassigned__" ? "Chưa assign" : assignee}</span>
              <span className="ml-2 text-muted-foreground">{items.length} task · {points} pt{overdue ? ` · ${overdue} quá hạn` : ""}</span>
            </button>
          );
        })}
        <span className="ml-auto flex items-center gap-1">
          <a href={`/reports/projects/${encodeURIComponent(projectKey)}`} className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><BarChart3 className="h-3.5 w-3.5" aria-hidden />Báo cáo team</a>
          <a href="/stale" className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><Clock3 className="h-3.5 w-3.5" aria-hidden />Task stale</a>
        </span>
      </div>

      {lanes.map(([assignee, items]) => {
        const isCollapsed = collapsed.has(assignee);
        return (
          <section key={assignee} className="rounded-lg border bg-background">
            <button type="button" onClick={() => setCollapsed((current) => {
              const next = new Set(current); if (next.has(assignee)) next.delete(assignee); else next.add(assignee); return next;
            })} className="flex w-full cursor-pointer items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-muted/40">
              {isCollapsed ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
              <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="font-medium">{assignee === "__unassigned__" ? "Chưa assign" : assignee}</span>
              <span className="text-xs text-muted-foreground">{items.length} task · {items.reduce((sum, item) => sum + (item.points ?? 0), 0)} points</span>
            </button>
            {!isCollapsed && (
              <div className="grid min-w-max gap-2 p-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(16rem, 1fr))` }}>
                {columns.map((column) => {
                  const bucket = items.filter((item) => findColumn(item) === column.key);
                  return (
                    <div key={column.key} className="min-h-20 rounded-md bg-muted/30 p-2">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium"><span>{column.label}</span><span className="tabular-nums text-muted-foreground">{bucket.length}</span></div>
                      <div className="space-y-2">
                        {bucket.map((issue) => <button key={issue.jiraKey} type="button" onClick={() => onOpen(issue)} className={cn("block w-full cursor-pointer text-left")}><CardContent issue={issue} done={issue.statusCategory === "done"} /></button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
