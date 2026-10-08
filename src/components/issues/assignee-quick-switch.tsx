"use client";

import * as React from "react";
import { UserX, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AssigneeScope, type AssigneeToken } from "@/lib/issues/issue-filters";
import { JiraAvatar } from "@/components/jira-avatar";

export interface AssigneeQuickSwitchProps {
  value: AssigneeScope;
  onChange: (value: AssigneeScope) => void;
  myName?: string | null;
  className?: string;
}

export function AssigneeQuickSwitch({
  value,
  onChange,
  myName,
  className,
}: AssigneeQuickSwitchProps) {
  // Only render when roster has at least two members
  if (value.mode !== "roster" || value.roster.length < 2) {
    return null;
  }

  const isAllSelected = value.view === "all-selected";

  const handleSelectView = (view: "all-selected" | AssigneeToken) => {
    onChange({
      ...value,
      view,
    });
  };

  const getMemberLabel = (token: AssigneeToken) => {
    if (token === "me") {
      return myName ? `Bạn (${myName})` : "Bạn";
    }
    if (token === "unassigned") {
      return "Chưa gán";
    }
    return token;
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 overflow-x-auto [scrollbar-width:thin] py-1 text-xs text-muted-foreground",
        className
      )}
      role="region"
      aria-label="Chuyển nhanh góc nhìn người phụ trách"
    >
      <span className="shrink-0 font-medium text-[11px] text-muted-foreground uppercase tracking-wider pl-0.5">
        Xem nhanh:
      </span>

      <div className="flex items-center gap-1.5 min-w-0">
        {/* Union Chip: Tất cả đã chọn */}
        <button
          type="button"
          aria-pressed={isAllSelected}
          onClick={() => handleSelectView("all-selected")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium cursor-pointer transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            isAllSelected
              ? "border-primary bg-primary/10 text-primary shadow-xs font-semibold"
              : "border-border/80 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60"
          )}
        >
          <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>Tất cả đã chọn</span>
          <span
            className={cn(
              "rounded-full px-1 py-0.2 text-[10px] tabular-nums font-semibold",
              isAllSelected
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {value.roster.length}
          </span>
        </button>

        {/* Member Chips */}
        {value.roster.map((token) => {
          const isActive = value.view.toLowerCase() === token.toLowerCase();
          const isUnassigned = token === "unassigned";

          return (
            <button
              key={token}
              type="button"
              aria-pressed={isActive}
              onClick={() => handleSelectView(token)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors duration-150 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isActive
                  ? "border-primary bg-primary/10 text-primary shadow-xs font-semibold"
                  : "border-border/80 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {isUnassigned ? (
                <div
                  className="h-4 w-4 rounded-full flex items-center justify-center bg-muted text-muted-foreground shrink-0"
                  aria-hidden="true"
                >
                  <UserX className="h-2.5 w-2.5" />
                </div>
              ) : (
                <JiraAvatar
                  username={token === "me" ? (myName ?? "Me") : token}
                  size="xs"
                  className="shrink-0"
                />
              )}
              <span className="truncate max-w-[140px]">
                {getMemberLabel(token)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
