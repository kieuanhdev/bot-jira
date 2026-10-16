"use client";

import { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, Clock3, UserRound } from "lucide-react";
import type { IssueItem } from "@/hooks/use-issues";
import type { BoardColumn } from "./lib/board-columns";
import { BoardCardBody } from "./board-card";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/due-date";
import { JiraAvatar } from "@/components/jira-avatar";

/** Cards rendered per lane cell before "Xem thêm". */
const CELL_LIMIT = 4;

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
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const lanes = useMemo(() => {
    const map = new Map<string, IssueItem[]>();
    for (const issue of issues) {
      const key = issue.assigneeJira ?? "__unassigned__";
      const lane = map.get(key);
      if (lane) lane.push(issue);
      else map.set(key, [issue]);
    }
    return [...map.entries()].sort(([a], [b]) => a === "__unassigned__" ? 1 : b === "__unassigned__" ? -1 : a.localeCompare(b));
  }, [issues]);

  // assignee -> column key -> issues, computed in one pass instead of lanes x columns filters.
  const buckets = useMemo(() => {
    const out = new Map<string, Map<string, IssueItem[]>>();
    for (const [assignee, items] of lanes) {
      const byCol = new Map<string, IssueItem[]>();
      for (const item of items) {
        const col = findColumn(item);
        const list = byCol.get(col);
        if (list) list.push(item);
        else byCol.set(col, [item]);
      }
      out.set(assignee, byCol);
    }
    return out;
  }, [lanes, findColumn]);
  const columnTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const byColumn of buckets.values()) {
      for (const [columnKey, items] of byColumn) {
        totals.set(columnKey, (totals.get(columnKey) ?? 0) + items.length);
      }
    }
    return totals;
  }, [buckets]);

  function toggleExpandedCell(cellId: string) {
    setExpandedCells((current) => {
      const next = new Set(current);
      if (next.has(cellId)) next.delete(cellId);
      else next.add(cellId);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/10">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-4" aria-hidden />
          </span>
          <span className="font-medium">Khối lượng team</span>
          <span className="text-xs text-muted-foreground">
            {lanes.length} thành viên · {issues.length} task
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <a href={`/reports/projects/${encodeURIComponent(projectKey)}`} className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><BarChart3 className="h-3.5 w-3.5" aria-hidden />Báo cáo team</a>
          <a href="/stale" className="inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"><Clock3 className="h-3.5 w-3.5" aria-hidden />Task stale</a>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-separate border-spacing-0">
          <caption className="sr-only">
            Task của từng thành viên theo trạng thái
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-30 w-52 min-w-52 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Thành viên
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="sticky top-0 z-20 w-72 min-w-64 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold last:border-r-0">
                  <span className="flex items-center justify-between gap-2">
                    <span>{column.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {columnTotals.get(column.key) ?? 0}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.map(([assignee, items]) => {
              const displayName = assignee === "__unassigned__" ? "Chưa assign" : assignee;
              const overdue = items.filter((item) => isOverdue(item.dueDate, item.statusCategory === "done")).length;
              const points = items.reduce((sum, item) => sum + (item.points ?? 0), 0);

              return (
                <tr key={assignee} className="group/row">
                  <th scope="row" className="sticky left-0 z-10 w-52 min-w-52 border-b border-r bg-background p-3 text-left align-top transition-colors group-hover/row:bg-muted/30">
                    <button
                      type="button"
                      onClick={() => onSelectAssignee(assignee === "__unassigned__" ? null : assignee)}
                      className="flex w-full cursor-pointer items-start gap-2 rounded-md text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title={`Chỉ xem task của ${displayName}`}
                    >
                      <JiraAvatar username={assignee === "__unassigned__" ? null : assignee} size="sm" title={displayName} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{displayName}</span>
                        <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                          {items.length} task · {points} pt
                        </span>
                        {overdue > 0 && (
                          <span className="mt-1 block text-[11px] font-medium text-destructive">
                            {overdue} quá hạn
                          </span>
                        )}
                      </span>
                    </button>
                  </th>
                  {columns.map((column) => {
                    const bucket = buckets.get(assignee)?.get(column.key) ?? [];
                    const cellId = `${assignee}|${column.key}`;
                    const isExpanded = expandedCells.has(cellId);
                    const shown = isExpanded ? bucket : bucket.slice(0, CELL_LIMIT);
                    return (
                      <td key={column.key} className="w-72 min-w-64 border-b border-r bg-background/70 p-2 align-top transition-colors last:border-r-0 group-hover/row:bg-muted/20">
                        <div className="space-y-2">
                          {shown.length === 0 && (
                            <span className="block py-2 text-center text-xs text-muted-foreground/60">—</span>
                          )}
                          {shown.map((issue) => (
                            <button
                              key={issue.jiraKey}
                              data-issue-key={issue.jiraKey}
                              type="button"
                              onClick={() => onOpen(issue)}
                              className={cn("block w-full cursor-pointer text-left")}
                            >
                              <BoardCardBody issue={issue} done={issue.statusCategory === "done"} />
                            </button>
                          ))}
                          {bucket.length > CELL_LIMIT && (
                            <button
                              type="button"
                              onClick={() => toggleExpandedCell(cellId)}
                              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                            >
                              {isExpanded ? (
                                <><ChevronUp className="size-3" aria-hidden />Thu gọn</>
                              ) : (
                                <><ChevronDown className="size-3" aria-hidden />Xem thêm {bucket.length - shown.length}</>
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
