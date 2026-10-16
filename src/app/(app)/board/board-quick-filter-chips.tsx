"use client";

import type { Dispatch, SetStateAction } from "react";
import type { BoardQuickFilter } from "./lib/board-filter-controller";

export interface BoardQuickFilterChipsProps {
  quickFilter: BoardQuickFilter;
  setQuickFilter: Dispatch<SetStateAction<BoardQuickFilter>>;
  peopleFieldData?: {
    fields: {
      reporter: string;
      approver?: string | null;
      tester?: string | null;
    };
  };
}

export function BoardQuickFilterChips({
  quickFilter,
  setQuickFilter,
  peopleFieldData,
}: BoardQuickFilterChipsProps) {
  const chips: Array<[BoardQuickFilter, string]> = [
    ["overdue", "Quá hạn"],
    ["unassigned", "Chưa assign"],
    ["unestimated", "Chưa estimate"],
    ["stale", "Stale 7d+"],
    ...(peopleFieldData?.fields.approver ? ([["missingApprover", "Thiếu Approver"]] as Array<[BoardQuickFilter, string]>) : []),
    ...(peopleFieldData?.fields.tester ? ([["missingTester", "Thiếu Tester"]] as Array<[BoardQuickFilter, string]>) : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 border-l pl-2">
      {chips.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setQuickFilter((current: BoardQuickFilter) => (current === key ? "" : key))}
          className={`h-7 cursor-pointer rounded-full border px-2.5 text-[11px] font-medium transition-colors ${
            quickFilter === key
              ? "border-primary/50 bg-primary/10 text-primary"
              : "bg-background hover:bg-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
