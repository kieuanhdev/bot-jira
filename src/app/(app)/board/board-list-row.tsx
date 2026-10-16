"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { IssueItem } from "@/hooks/use-issues";
import { timeAgo } from "@/lib/utils";
import { PRIORITIES } from "./lib/quick-panel-utils";
import {
  DateCell,
  FixVersionCell,
  PointsCell,
  SelectCell,
  StatusCell,
} from "./board-list-inline-cells";
import type { ListOptions } from "./board-list-view";

const stop = (e: React.MouseEvent) => e.stopPropagation();

function dateLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(date);
}

const toIsoDay = (d: string | null) => (d ? `${d}T00:00:00.000Z` : null);

export interface BoardListRowProps {
  issue: IssueItem;
  isSelected: boolean;
  statusCategory: string;
  status: string;
  isOverdue: boolean;
  hiddenTableCols: Set<string>;
  options: ListOptions;
  epicOptions: string[];
  onToggleSelect: (key: string) => void;
  onOpen: (issue: IssueItem) => void;
  onEdit: (issue: IssueItem, api: Record<string, unknown>, item: Partial<IssueItem>) => void;
  onTransition: (issue: IssueItem, transitionId: string, toStatus: string) => void;
}

export function BoardListRow({
  issue,
  isSelected,
  status,
  isOverdue,
  hiddenTableCols,
  options,
  epicOptions,
  onToggleSelect,
  onOpen,
  onEdit,
  onTransition,
}: BoardListRowProps) {
  const show = (col: string) => !hiddenTableCols.has(col);

  const person = (
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
      onChange={(v) => onEdit(issue, { [field]: v }, { [`${field}Jira`]: v })}
    />
  );

  return (
    <tr
      data-row
      data-issue-key={issue.jiraKey}
      data-selected={isSelected || undefined}
      className="cursor-pointer border-t transition-colors hover:bg-muted/30 data-[selected]:bg-primary/5"
      onClick={() => onOpen(issue)}
    >
      <td className="px-3 py-2" onClick={stop}>
        <Checkbox
          aria-label={`Chọn ${issue.jiraKey}`}
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(issue.jiraKey)}
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-primary">{issue.jiraKey}</td>
      <td className="max-w-xs truncate px-3 py-2 font-medium">{issue.summary}</td>
      {show("type") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <SelectCell
            label={`Đổi loại ${issue.jiraKey}`}
            value={issue.type || null}
            options={options.types}
            onChange={(v) => v && onEdit(issue, { issueType: v }, { type: v })}
          />
        </td>
      )}
      {show("points") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <PointsCell
            jiraKey={issue.jiraKey}
            value={issue.points}
            onChange={(points) => onEdit(issue, { points }, { points })}
          />
        </td>
      )}
      {show("status") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <StatusCell
            jiraKey={issue.jiraKey}
            status={status}
            onTransition={(id, to) => onTransition(issue, id, to)}
          />
        </td>
      )}
      {show("assignee") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          {person("assignee", issue.assigneeJira, options.assignees, "Chưa gán")}
        </td>
      )}
      {show("priority") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <SelectCell
            label={`Đổi độ ưu tiên ${issue.jiraKey}`}
            value={issue.priority || null}
            options={PRIORITIES}
            onChange={(v) => v && onEdit(issue, { priority: v }, { priority: v })}
          />
        </td>
      )}
      {show("due") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <DateCell
            label={`Đổi hạn ${issue.jiraKey}`}
            value={issue.dueDate}
            display={dateLabel(issue.dueDate)}
            danger={isOverdue}
            onChange={(d) => onEdit(issue, { dueDate: d }, { dueDate: toIsoDay(d) })}
          />
        </td>
      )}
      {show("epic") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <SelectCell
            label={`Đổi epic ${issue.jiraKey}`}
            value={issue.epic ?? null}
            options={epicOptions}
            clearLabel="Bỏ epic"
            onChange={(v) => onEdit(issue, { epic: v }, { epic: v })}
          />
        </td>
      )}
      {show("fixVersion") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          <FixVersionCell
            jiraKey={issue.jiraKey}
            names={issue.fixVersionNames}
            onToggle={(version, on) =>
              onEdit(
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
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          {person("reporter", issue.reporterJira, options.reporters)}
        </td>
      )}
      {show("approver") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          {person("approver", issue.approverJira, options.approvers, "Xóa approver")}
        </td>
      )}
      {show("tester") && (
        <td className="max-w-48 px-3 py-2 text-muted-foreground" onClick={stop}>
          {person("tester", issue.testerJira, options.testers, "Xóa tester")}
        </td>
      )}
      {show("created") && <td className="px-3 py-2 text-muted-foreground">{dateLabel(issue.createdAt)}</td>}
      {show("updated") && <td className="px-3 py-2 text-muted-foreground">{timeAgo(issue.updatedAt)}</td>}
    </tr>
  );
}
