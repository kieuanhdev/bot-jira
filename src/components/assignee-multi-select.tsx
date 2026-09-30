"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Users, Search, X, ChevronDown, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const AVATAR_PALETTE = [
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
];

function avatarClass(name: string | null | undefined): string {
  if (!name) return "bg-muted text-muted-foreground";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return name.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AssigneeMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  assignees: string[];
  myName?: string | null;
  className?: string;
}

export function AssigneeMultiSelect({
  value,
  onChange,
  assignees,
  myName,
  className,
}: AssigneeMultiSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  // Normalize current selection
  const isAll = value.length === 0 || value.includes("ALL");

  const isSelected = (key: string) => {
    if (isAll) return false;
    if (key === "me") {
      return value.includes("me") || (!!myName && value.includes(myName));
    }
    return value.includes(key);
  };

  const otherAssignees = useMemo(() => {
    return assignees.filter((a) => !myName || a.toLowerCase() !== myName.toLowerCase());
  }, [assignees, myName]);

  const filteredAssignees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return otherAssignees;
    return otherAssignees.filter((a) => a.toLowerCase().includes(q));
  }, [otherAssignees, search]);

  const toggle = (item: string) => {
    if (isAll) {
      // If currently showing All, clicking one person narrows filter to only them
      onChange([item]);
      return;
    }

    const currentSelected = value.filter((v) => v !== "ALL");
    let next: string[];

    if (item === "me") {
      const hasMe = isSelected("me");
      if (hasMe) {
        next = currentSelected.filter(
          (v) => v !== "me" && (!myName || v.toLowerCase() !== myName.toLowerCase())
        );
      } else {
        next = [...currentSelected, "me"];
      }
    } else {
      const exists = currentSelected.includes(item);
      if (exists) {
        next = currentSelected.filter((v) => v !== item);
      } else {
        next = [...currentSelected, item];
      }
    }

    if (next.length === 0) {
      onChange(["ALL"]);
    } else {
      onChange(next);
    }
  };

  // Determine label for trigger button
  const triggerLabel = useMemo(() => {
    if (isAll) return "Tất cả người phụ trách";

    const nonAll = value.filter((v) => v !== "ALL");
    if (nonAll.length === 0) return "Tất cả người phụ trách";

    const labels = nonAll.map((v) => {
      if (v === "me" || (myName && v.toLowerCase() === myName.toLowerCase())) {
        return myName ? `Bạn (${myName})` : "Bạn";
      }
      if (v === "unassigned") return "Chưa gán";
      return v;
    });

    if (labels.length === 1) {
      return labels[0];
    }
    return labels[0];
  }, [isAll, value, myName]);

  const extraCount = useMemo(() => {
    if (isAll) return 0;
    const nonAll = value.filter((v) => v !== "ALL");
    return Math.max(0, nonAll.length - 1);
  }, [isAll, value]);

  const showMe = !search || "bạn".includes(search.toLowerCase()) || (myName && myName.toLowerCase().includes(search.toLowerCase()));
  const showUnassigned = !search || "chưa gán".includes(search.toLowerCase()) || "unassigned".includes(search.toLowerCase());

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-9 min-w-[190px] max-w-[280px] justify-between text-xs sm:text-sm font-normal border-input hover:bg-accent/40 cursor-pointer transition-colors",
            !isAll && "border-primary/40 bg-primary/5",
            className
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 truncate">
            <Users className={cn("h-4 w-4 shrink-0", !isAll ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("truncate", !isAll && "font-medium text-foreground")}>
              {triggerLabel}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-1.5">
            {extraCount > 0 && (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[11px] font-semibold bg-primary/15 text-primary rounded-full hover:bg-primary/20"
              >
                +{extraCount}
              </Badge>
            )}

            {!isAll && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Xóa bộ lọc người phụ trách"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(["ALL"]);
                }}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Bỏ lọc (hiển thị tất cả)"
              >
                <X className="h-3 w-3" />
              </span>
            )}

            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72 p-1 max-h-[420px] flex flex-col shadow-lg border-border">
        {/* Search Input */}
        <div className="p-1.5 border-b border-border/60">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/60 bg-muted/20 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onChange(["ALL"])}
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
              onClick={() => onChange(["me"])}
              className={cn(
                "px-2 py-1 rounded text-xs transition-colors cursor-pointer font-medium",
                !isAll && value.length === 1 && (value[0] === "me" || value[0] === myName)
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
              onClick={() => onChange(["ALL"])}
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
              <div className="h-5 w-5 rounded-full flex items-center justify-center bg-muted text-muted-foreground shrink-0">
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

          {filteredAssignees.map((a) => {
            const checked = isSelected(a);
            return (
              <DropdownMenuItem
                key={a}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(a);
                }}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent focus:bg-accent transition-colors"
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <div
                  className={cn(
                    "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                    avatarClass(a)
                  )}
                >
                  {initials(a)}
                </div>
                <span className="text-xs truncate flex-1 font-normal text-foreground">{a}</span>
              </DropdownMenuItem>
            );
          })}

          {!showMe && !showUnassigned && filteredAssignees.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Không tìm thấy người phụ trách phù hợp
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-2.5 py-1.5 border-t border-border/60 text-[11px] text-muted-foreground flex justify-between items-center bg-muted/10">
          <span>{isAll ? "Đang hiển thị tất cả" : `Đã chọn ${value.filter((v) => v !== "ALL").length} người`}</span>
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
  );
}
