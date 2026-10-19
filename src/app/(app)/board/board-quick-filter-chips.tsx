"use client";

import type { Dispatch, SetStateAction } from "react";
import { cn } from "@/lib/utils";
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
    <div className="flex flex-wrap items-center gap-1.5 border-l border-border/60 pl-2.5">
      {chips.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setQuickFilter((current: BoardQuickFilter) => (current === key ? "" : key))}
          className={cn(
            "h-8 cursor-pointer rounded-full border px-3 text-xs font-medium transition-colors",
            quickFilter === key
              ? "border-primary/30 bg-primary-soft text-primary-soft-foreground font-semibold shadow-xs"
              : "border-border/70 bg-card text-foreground hover:bg-muted hover:border-border"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
