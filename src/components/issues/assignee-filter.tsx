"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Users, Search, X, ChevronDown, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  type AssigneeScope,
  type AssigneeToken,
  normalizeAssigneeToken,
} from "@/lib/issues/issue-filters";

const AVATAR_PALETTE = [
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

export function avatarClass(name: string | null | undefined): string {
  if (!name) return "bg-muted text-muted-foreground";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type AssigneeOption = {
  value: string;
  label?: string;
  count?: number;
};

export interface AssigneeFilterProps {
  value: AssigneeScope;
  onChange: (value: AssigneeScope) => void;
  options: (string | AssigneeOption)[];
  myName?: string | null;
  defaultScope?: AssigneeScope;
  clearTarget?: "all" | "default";
  disabled?: boolean;
  className?: string;
}

export function AssigneeFilter({
  value,
  onChange,
  options,
  myName,
  defaultScope,
  clearTarget = "all",
  disabled = false,
  className,
}: AssigneeFilterProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const isAll = value.mode === "all" || value.roster.length === 0;

  const normalizedOptions = useMemo<AssigneeOption[]>(() => {
    return options.map((opt) =>
      typeof opt === "string" ? { value: opt, label: opt } : opt
    );
  }, [options]);

  const isSelected = (token: AssigneeToken) => {
    if (isAll) return false;
    const normalized = normalizeAssigneeToken(token, myName);
    return value.roster.some(
      (r) => r.toLowerCase() === normalized.toLowerCase()
    );
  };

  const otherAssignees = useMemo(() => {
    return normalizedOptions.filter((opt) => {
      const val = opt.value.toLowerCase();
      if (val === "me" || val === "unassigned") return false;
      if (myName && val === myName.toLowerCase()) return false;
      return true;
    });
  }, [normalizedOptions, myName]);

  const filteredAssignees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return otherAssignees;
    return otherAssignees.filter(
      (opt) =>
        opt.value.toLowerCase().includes(q) ||
        (opt.label && opt.label.toLowerCase().includes(q))
    );
  }, [otherAssignees, search]);

  const toggle = (rawToken: string) => {
    const token = normalizeAssigneeToken(rawToken, myName);

    if (isAll) {
      onChange({
        mode: "roster",
        roster: [token],
        view: "all-selected",
      });
      return;
    }

    const currentRoster = [...value.roster];
    const exists = currentRoster.some(
      (r) => r.toLowerCase() === token.toLowerCase()
    );

    let nextRoster: AssigneeToken[];
    if (exists) {
      nextRoster = currentRoster.filter(
        (r) => r.toLowerCase() !== token.toLowerCase()
      );
    } else {
      nextRoster = [...currentRoster, token];
    }

    if (nextRoster.length === 0) {
      onChange({
        mode: "all",
        roster: [],
        view: "all-selected",
      });
    } else {
      // If currently active view was removed, reset view to all-selected
      const viewStillPresent =
        value.view === "all-selected" ||
        nextRoster.some((r) => r.toLowerCase() === value.view.toLowerCase());

      onChange({
        mode: "roster",
        roster: nextRoster,
        view: viewStillPresent ? value.view : "all-selected",
      });
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clearTarget === "default" && defaultScope) {
      onChange(defaultScope);
    } else {
      onChange({
        mode: "all",
        roster: [],
        view: "all-selected",
      });
    }
  };

  const triggerLabel = useMemo(() => {
    if (isAll) return "Tất cả người phụ trách";
    const first = value.roster[0];
    if (first === "me") {
      return myName ? `Bạn (${myName})` : "Bạn";
    }
    if (first === "unassigned") return "Chưa gán";
    const opt = normalizedOptions.find(
      (o) => o.value.toLowerCase() === first.toLowerCase()
    );
    return opt?.label ?? first;
  }, [isAll, value.roster, myName, normalizedOptions]);

  const extraCount = useMemo(() => {
    if (isAll) return 0;
    return Math.max(0, value.roster.length - 1);
  }, [isAll, value.roster]);

  const showMe =
    !search ||
    "bạn".includes(search.toLowerCase()) ||
    (myName && myName.toLowerCase().includes(search.toLowerCase()));
  const showUnassigned =
    !search ||
    "chưa gán".includes(search.toLowerCase()) ||
    "unassigned".includes(search.toLowerCase());

  const canClear = !isAll;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background shadow-xs text-xs sm:text-sm transition-colors",
        !isAll && "border-primary/40 bg-primary/5",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            // aria-controls is injected by Radix DropdownMenuTrigger while the menu is open.
            // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
            role="combobox"
            aria-expanded={open}
            aria-haspopup="menu"
            disabled={disabled}
            className={cn(
              "flex h-8 items-center gap-1.5 px-2.5 min-w-[170px] max-w-[260px] text-left cursor-pointer hover:bg-accent/40 rounded-l-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors",
              !canClear && "rounded-r-md"
            )}
          >
            <Users
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                !isAll ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "truncate flex-1 font-normal",
                !isAll && "font-medium text-foreground"
              )}
            >
              {triggerLabel}
            </span>

            {extraCount > 0 && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[10px] font-semibold bg-primary/15 text-primary rounded-full shrink-0"
              >
                +{extraCount}
              </Badge>
            )}

            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-0.5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          className="w-72 p-1 max-h-[420px] flex flex-col shadow-lg border-border"
        >
          {/* Search Input */}
          <div className="p-1.5 border-b border-border/60">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Tìm theo tên người phụ trách…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-8 pl-8 pr-7 text-xs bg-muted/40 rounded-md border border-input focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  title="Xóa tìm kiếm"
                  aria-label="Xóa tìm kiếm"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Presets */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/60 bg-muted/20 text-xs">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    mode: "all",
                    roster: [],
                    view: "all-selected",
                  })
                }
                className={cn(
                  "px-2 py-1 rounded text-xs transition-colors cursor-pointer font-medium",
                  isAll
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    mode: "roster",
                    roster: ["me"],
                    view: "all-selected",
                  })
                }
                className={cn(
                  "px-2 py-1 rounded text-xs transition-colors cursor-pointer font-medium",
                  !isAll &&
                    value.roster.length === 1 &&
                    value.roster[0] === "me"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Chỉ mình tôi
              </button>
            </div>

            {!isAll && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors cursor-pointer px-1 py-0.5"
              >
                Đặt lại
              </button>
            )}
          </div>

          {/* Scrollable Assignee List */}
          <div className="overflow-y-auto max-h-56 p-1 flex-1 space-y-0.5">
            {showMe && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  toggle("me");
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent focus:bg-accent transition-colors"
              >
                <Checkbox checked={isSelected("me")} className="pointer-events-none" />
                <div
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                    avatarClass(myName ?? "Me")
                  )}
                  aria-hidden="true"
                >
                  {initials(myName ?? "Me")}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-medium truncate">
                    Bạn {myName ? <span className="text-muted-foreground font-normal">({myName})</span> : null}
                  </span>
                </div>
              </DropdownMenuItem>
            )}

            {showUnassigned && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  toggle("unassigned");
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent focus:bg-accent transition-colors"
              >
                <Checkbox checked={isSelected("unassigned")} className="pointer-events-none" />
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center bg-muted text-muted-foreground shrink-0"
                  aria-hidden="true"
                >
                  <UserX className="h-3 w-3" />
                </div>
                <span className="text-xs truncate flex-1">Chưa gán</span>
              </DropdownMenuItem>
            )}

            {(showMe || showUnassigned) && filteredAssignees.length > 0 && (
              <DropdownMenuSeparator className="my-1" />
            )}

            {filteredAssignees.length > 0 && (
              <DropdownMenuLabel className="px-2 py-1 text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                Thành viên ({filteredAssignees.length})
              </DropdownMenuLabel>
            )}

            {filteredAssignees.map((opt) => {
              const checked = isSelected(opt.value);
              return (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={(e) => {
                    e.preventDefault();
                    toggle(opt.value);
                  }}
                  className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent focus:bg-accent transition-colors"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <div
                    className={cn(
                      "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                      avatarClass(opt.value)
                    )}
                    aria-hidden="true"
                  >
                    {initials(opt.value)}
                  </div>
                  <span className="text-xs truncate flex-1 font-normal text-foreground">
                    {opt.label ?? opt.value}
                  </span>
                  {opt.count != null && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {opt.count}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}

            {!showMe && !showUnassigned && filteredAssignees.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Không tìm thấy người phụ trách phù hợp
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-2.5 py-1.5 border-t border-border/60 text-[11px] text-muted-foreground flex justify-between items-center bg-muted/10">
            <span>
              {isAll
                ? "Đang hiển thị tất cả"
                : `Đã chọn ${value.roster.length} người`}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] font-medium text-primary hover:underline cursor-pointer"
            >
              Xong
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Split Clear Button: independent button, strictly outside dropdown trigger */}
      {canClear && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Hiển thị tất cả người phụ trách"
          title="Bỏ lọc (hiển thị tất cả)"
          className="flex h-8 w-7 items-center justify-center border-l border-input/60 rounded-r-md text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors shrink-0"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
