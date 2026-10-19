"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { IssueItem } from "@/hooks/use-issues";
import { cn } from "@/lib/utils";
import { PRIORITY_RANK } from "./lib/board-types";
import { BoardListBulkBar } from "./board-list-bulk-bar";
import { BoardListRow } from "./board-list-row";
import { useWindowedRows } from "@/hooks/use-windowed-rows";

export type ListOptions = {
  statuses: string[];
  assignees: string[];
  types: string[];
  epics: string[];
  reporters: string[];
  approvers: string[];
  testers: string[];
};

export type EditFn = (
  targets: IssueItem[],
  api: Record<string, unknown>,
  itemFor: (issue: IssueItem) => Partial<IssueItem>
) => void;

type SortKey =
  | "key" | "summary" | "type" | "points" | "status" | "assignee" | "priority" | "due"
  | "epic" | "fixVersion" | "reporter" | "approver" | "tester" | "created" | "updated";
type SortState = { key: SortKey; dir: "asc" | "desc" } | null;

const time = (v: string | null) => (v ? new Date(v).getTime() || null : null);
const keyNum = (k: string) => Number(k.split("-").pop()) || 0;

/** Sort value per column; null always sorts last. */
const SORT_VALUE: Record<SortKey, (i: IssueItem, status: string) => string | number | null> = {
  key: (i) => keyNum(i.jiraKey),
  summary: (i) => i.summary,
  type: (i) => i.type || null,
  points: (i) => i.points,
  status: (_i, status) => status || null,
  assignee: (i) => i.assigneeJira,
  priority: (i) => PRIORITY_RANK[i.priority] ?? null,
  due: (i) => time(i.dueDate),
  epic: (i) => i.epic ?? null,
  fixVersion: (i) => i.fixVersionNames.join(", ") || null,
  reporter: (i) => i.reporterJira ?? null,
  approver: (i) => i.approverJira ?? null,
  tester: (i) => i.testerJira ?? null,
  created: (i) => time(i.createdAt),
  updated: (i) => time(i.updatedAt),
};

function SortTh({
  col,
  label,
  sort,
  onSort,
}: {
  col: SortKey;
  label: string;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const active = sort?.key === col;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className="px-3 py-2 font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "-mx-1 inline-flex cursor-pointer items-center gap-1 rounded px-1 transition-colors duration-150 hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon aria-hidden className={cn("h-3 w-3", !active && "opacity-40")} />
      </button>
    </th>
  );
}

/** Table view of all loaded issues: inline-editable cells, sorting and bulk edit. */
export function BoardListView({
  issues,
  hiddenTableCols,
  options,
  statusOverrides,
  hasMore,
  loadingMore,
  onOpen,
  onLoadMore,
  onEdits,
  onTransition,
  onBulkTransition,
}: {
  issues: IssueItem[];
  hiddenTableCols: Set<string>;
  options: ListOptions;
  statusOverrides: Map<string, string>;
  hasMore: boolean;
  loadingMore: boolean;
  onOpen: (issue: IssueItem) => void;
  onLoadMore: () => void;
  onEdits: EditFn;
  onTransition: (issue: IssueItem, transitionId: string, toStatus: string) => void;
  onBulkTransition: (targets: IssueItem[], toStatus: string) => void;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null
    );

  const rows = useMemo(() => {
    if (!sort) return issues;
    const val = SORT_VALUE[sort.key];
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...issues].sort((a, b) => {
      const x = val(a, statusOverrides.get(a.jiraKey) ?? a.status);
      const y = val(b, statusOverrides.get(b.jiraKey) ?? b.status);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      if (typeof x === "number" && typeof y === "number") return (x - y) * sign;
      return String(x).localeCompare(String(y), "vi", { numeric: true }) * sign;
    });
  }, [issues, sort, statusOverrides]);

  const selected = useMemo(() => issues.filter((i) => selectedKeys.has(i.jiraKey)), [issues, selectedKeys]);
  const allChecked = rows.length > 0 && selected.length === rows.length;
  const toggleAll = () =>
    setSelectedKeys(allChecked ? new Set() : new Set(rows.map((r) => r.jiraKey)));
  const toggleOne = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }, []);

  const {
    scrollRef,
    tbodyRef,
    startIdx,
    endIdx,
    padTop,
    padBottom,
    windowed,
  } = useWindowedRows({ totalRows: rows.length });

  const visibleRows = windowed ? rows.slice(startIdx, endIdx) : rows;
  const colSpan = 16;

  const show = (col: string) => !hiddenTableCols.has(col);
  const edit = useCallback(
    (issue: IssueItem, api: Record<string, unknown>, item: Partial<IssueItem>) => {
      onEdits([issue], api, () => item);
    },
    [onEdits]
  );
  const th = (col: SortKey, label: string) => (
    <SortTh col={col} label={label} sort={sort} onSort={toggleSort} />
  );

  const [now] = useState(() => Date.now());

  const epicOptionsMap = useMemo(() => {
    const epics = options.epics;
    const map = new Map<string, string[]>();
    for (const r of visibleRows) {
      map.set(r.jiraKey, epics.filter((e) => e !== r.jiraKey));
    }
    return map;
  }, [options.epics, visibleRows]);

  return (
    <div ref={scrollRef} className="max-h-[calc(100dvh-15rem)] min-h-[24rem] flex-1 overflow-auto overscroll-x-contain rounded-xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
      {selected.length > 0 && (
        <BoardListBulkBar
          selected={selected}
          options={options}
          onEdits={onEdits}
          onBulkTransition={onBulkTransition}
          onClear={() => setSelectedKeys(new Set())}
        />
      )}
      <table className="w-full min-w-max whitespace-nowrap text-sm">
        <thead
          className={cn(
            "sticky z-10 h-11 bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur-xs",
            selected.length > 0 ? "top-[3.25rem]" : "top-0"
          )}
        >
          <tr>
            <th className="w-9 px-3 py-2.5">
              <Checkbox
                aria-label="Chọn tất cả"
                checked={allChecked ? true : selected.length > 0 ? "indeterminate" : false}
                onCheckedChange={toggleAll}
              />
            </th>
            {th("key", "Key")}
            {th("summary", "Summary")}
            {show("type") && th("type", "Type")}
            {show("points") && th("points", "Points")}
            {show("status") && th("status", "Status")}
            {show("assignee") && th("assignee", "Assignee")}
            {show("priority") && th("priority", "Priority")}
            {show("due") && th("due", "Due")}
            {show("epic") && th("epic", "Epic")}
            {show("fixVersion") && th("fixVersion", "Fix version")}
            {show("reporter") && th("reporter", "Reporter")}
            {show("approver") && th("approver", "Approver")}
            {show("tester") && th("tester", "Tester")}
            {show("created") && th("created", "Created")}
            {show("updated") && th("updated", "Updated")}
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {padTop > 0 && (
            <tr aria-hidden style={{ height: padTop }}>
              <td colSpan={colSpan} />
            </tr>
          )}
          {visibleRows.map((issue) => {
            const isOverdue = Boolean(
              issue.dueDate && new Date(issue.dueDate).getTime() < now && issue.statusCategory !== "done"
            );
            return (
              <BoardListRow
                key={issue.jiraKey}
                issue={issue}
                isSelected={selectedKeys.has(issue.jiraKey)}
                statusCategory={issue.statusCategory}
                status={statusOverrides.get(issue.jiraKey) ?? issue.status}
                isOverdue={isOverdue}
                hiddenTableCols={hiddenTableCols}
                options={options}
                epicOptions={epicOptionsMap.get(issue.jiraKey) ?? options.epics}
                onToggleSelect={toggleOne}
                onOpen={onOpen}
                onEdit={edit}
                onTransition={onTransition}
              />
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden style={{ height: padBottom }}>
              <td colSpan={colSpan} />
            </tr>
          )}
        </tbody>
      </table>
      {hasMore && (
        <div className="border-t p-3 text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Đang tải…" : "Xem thêm"}
          </Button>
        </div>
      )}
    </div>
  );
}
