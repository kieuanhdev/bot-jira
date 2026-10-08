import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { IssueItem } from "@/hooks/use-issues";
import { cn, timeAgo } from "@/lib/utils";
import { PRIORITY_RANK } from "./lib/board-types";
import { PRIORITIES } from "./lib/quick-panel-utils";
import {
  DateCell,
  FixVersionCell,
  PointsCell,
  SelectCell,
  StatusCell,
} from "./board-list-inline-cells";
import { BoardListBulkBar } from "./board-list-bulk-bar";

/** Dropdown choices for the editable columns. */
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

// Cells swallow clicks so opening a dropdown doesn't also open the quick panel.
const stop = (e: React.MouseEvent) => e.stopPropagation();

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

const toIsoDay = (d: string | null) => (d ? `${d}T00:00:00.000Z` : null);

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
  // asc -> desc -> back to the server order
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
  const toggleOne = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const show = (col: string) => !hiddenTableCols.has(col);
  const edit = (issue: IssueItem, api: Record<string, unknown>, item: Partial<IssueItem>) =>
    onEdits([issue], api, () => item);
  const th = (col: SortKey, label: string) => (
    <SortTh col={col} label={label} sort={sort} onSort={toggleSort} />
  );
  const person = (
    issue: IssueItem,
    field: "assignee" | "reporter" | "approver" | "tester",
    value: string | null,
    list: string[],
    clearLabel?: string
  ) => (
    <SelectCell
      label={`Đổi ${field} ${issue.jiraKey}`}
      value={value}
      options={list}
      clearLabel={clearLabel}
      onChange={(v) => edit(issue, { [field]: v }, { [`${field}Jira`]: v })}
    />
  );

  return (
    <div className="max-h-[calc(100dvh-15rem)] min-h-[24rem] flex-1 overflow-auto overscroll-x-contain rounded-lg border">
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
            "sticky z-10 bg-muted text-left text-xs text-muted-foreground",
            selected.length > 0 ? "top-[3.25rem]" : "top-0"
          )}
        >
          <tr>
            <th className="w-9 px-3 py-2">
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
        <tbody>
          {rows.map((issue) => {
            const overdue =
              issue.dueDate && new Date(issue.dueDate) < new Date() && issue.statusCategory !== "done";
            return (
              <tr
                key={issue.jiraKey}
                data-selected={selectedKeys.has(issue.jiraKey) || undefined}
                className="cursor-pointer border-t transition-colors hover:bg-muted/30 data-[selected]:bg-primary/5"
                onClick={() => onOpen(issue)}
              >
                <td className="px-3 py-2" onClick={stop}>
                  <Checkbox
                    aria-label={`Chọn ${issue.jiraKey}`}
                    checked={selectedKeys.has(issue.jiraKey)}
                    onCheckedChange={() => toggleOne(issue.jiraKey)}
                  />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-primary">{issue.jiraKey}</td>
                <td className="max-w-xs truncate px-3 py-2 font-medium">{issue.summary}</td>
                {show("type") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <SelectCell
                      label={`Đổi loại ${issue.jiraKey}`}
                      value={issue.type || null}
                      options={options.types}
                      onChange={(v) => v && edit(issue, { issueType: v }, { type: v })}
                    />
                  </td>
                )}
                {show("points") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <PointsCell
                      jiraKey={issue.jiraKey}
                      value={issue.points}
                      onChange={(points) => edit(issue, { points }, { points })}
                    />
                  </td>
                )}
                {show("status") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <StatusCell
                      jiraKey={issue.jiraKey}
                      status={statusOverrides.get(issue.jiraKey) ?? issue.status}
                      onTransition={(id, to) => onTransition(issue, id, to)}
                    />
                  </td>
                )}
                {show("assignee") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    {person(issue, "assignee", issue.assigneeJira, options.assignees, "Chưa gán")}
                  </td>
                )}
                {show("priority") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <SelectCell
                      label={`Đổi độ ưu tiên ${issue.jiraKey}`}
                      value={issue.priority || null}
                      options={PRIORITIES}
                      onChange={(v) => v && edit(issue, { priority: v }, { priority: v })}
                    />
                  </td>
                )}
                {show("due") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <DateCell
                      label={`Đổi hạn ${issue.jiraKey}`}
                      value={issue.dueDate}
                      display={dateLabel(issue.dueDate)}
                      danger={Boolean(overdue)}
                      onChange={(d) => edit(issue, { dueDate: d }, { dueDate: toIsoDay(d) })}
                    />
                  </td>
                )}
                {show("epic") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    <SelectCell
                      label={`Đổi epic ${issue.jiraKey}`}
                      value={issue.epic ?? null}
                      options={options.epics.filter((e) => e !== issue.jiraKey)}
                      clearLabel="Bỏ epic"
                      onChange={(v) => edit(issue, { epic: v }, { epic: v })}
                    />
                  </td>
                )}
                {show("fixVersion") && (
                  <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
                    <FixVersionCell
                      jiraKey={issue.jiraKey}
                      names={issue.fixVersionNames}
                      onToggle={(version, on) =>
                        edit(
                          issue,
                          on ? { addFixVersion: version } : { removeFixVersion: version },
                          {
                            fixVersionNames: on
                              ? [...issue.fixVersionNames, version]
                              : issue.fixVersionNames.filter((v) => v !== version),
                          }
                        )
                      }
                    />
                  </td>
                )}
                {show("reporter") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    {person(issue, "reporter", issue.reporterJira, options.reporters)}
                  </td>
                )}
                {show("approver") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    {person(issue, "approver", issue.approverJira, options.approvers, "Xóa approver")}
                  </td>
                )}
                {show("tester") && (
                  <td className="px-3 py-2 text-muted-foreground" onClick={stop}>
                    {person(issue, "tester", issue.testerJira, options.testers, "Xóa tester")}
                  </td>
                )}
                {show("created") && <td className="px-3 py-2 text-muted-foreground">{dateLabel(issue.createdAt)}</td>}
                {show("updated") && <td className="px-3 py-2 text-muted-foreground">{timeAgo(issue.updatedAt)}</td>}
              </tr>
            );
          })}
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
