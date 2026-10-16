"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchField } from "./search-field";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export type FacetOption = string | { value: string; label?: string; count?: number };

export interface FacetMultiSelectProps {
  title: string;
  options: (string | FacetOption)[];
  selected: string[];
  onChange: (next: string[]) => void;
  className?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  allowCustom?: boolean;
}

const MAX_DISPLAYED_OPTIONS = 100;

export function FacetMultiSelect({
  title,
  options,
  selected,
  onChange,
  className,
  searchable = false,
  searchPlaceholder,
  allowCustom = false,
}: FacetMultiSelectProps) {
  const [search, setSearch] = useState("");
  const isAll = selected.length === 0;

  const normalizedOptions = useMemo<{ value: string; label: string; count?: number }[]>(() => {
    return options.map((opt) =>
      typeof opt === "string"
        ? { value: opt, label: opt }
        : { value: opt.value, label: opt.label ?? opt.value, count: opt.count }
    );
  }, [options]);

  const toggle = (optVal: string) => {
    if (selected.includes(optVal)) {
      onChange(selected.filter((item) => item !== optVal));
    } else {
      onChange([...selected, optVal]);
    }
  };

  const label = useMemo(() => {
    if (isAll) return `Tất cả ${title.toLowerCase()}`;
    const firstMatch = normalizedOptions.find(
      (o) => o.value.toLowerCase() === selected[0].toLowerCase()
    );
    return firstMatch ? firstMatch.label : selected[0];
  }, [isAll, selected, title, normalizedOptions]);

  const extraCount = Math.max(0, selected.length - 1);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return normalizedOptions;
    const q = search.trim().toLowerCase();
    return normalizedOptions.filter(
      (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [normalizedOptions, search]);

  const canAddCustom = useMemo(() => {
    if (!allowCustom || !search.trim()) return false;
    const q = search.trim().toLowerCase();
    return !normalizedOptions.some((o) => o.value.toLowerCase() === q);
  }, [allowCustom, search, normalizedOptions]);

  const displayedOptions = filteredOptions.slice(0, MAX_DISPLAYED_OPTIONS);
  const hasMoreOptions = filteredOptions.length > MAX_DISPLAYED_OPTIONS;

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background shadow-xs text-xs sm:text-sm transition-colors",
        !isAll && "border-primary/40 bg-primary/5",
        className
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-8 items-center gap-1.5 px-2.5 min-w-[130px] max-w-[200px] text-left cursor-pointer hover:bg-accent/40 rounded-l-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors",
              isAll && "rounded-r-md"
            )}
          >
            <span
              className={cn(
                "truncate flex-1 font-normal",
                !isAll && "font-medium text-foreground"
              )}
            >
              {label}
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

        <DropdownMenuContent align="start" className="w-64 p-1 max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
            {title}
          </DropdownMenuLabel>
          {searchable && (
            <div
              className="p-1 pb-1.5 border-b border-border/50 sticky top-0 bg-popover z-10"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <SearchField
                value={search}
                onChange={setSearch}
                placeholder={searchPlaceholder ?? `Tìm ${title.toLowerCase()}…`}
                ariaLabel={`Tìm ${title.toLowerCase()}`}
                className="w-full"
              />
            </div>
          )}
          <DropdownMenuSeparator className="my-1" />
          {displayedOptions.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <DropdownMenuItem
                key={opt.value}
                onSelect={(e) => {
                  e.preventDefault();
                  toggle(opt.value);
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs"
              >
                <Checkbox checked={checked} className="pointer-events-none" />
                <span className="truncate flex-1">{opt.label}</span>
                {typeof opt.count === "number" && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {opt.count}
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          {hasMoreOptions && (
            <div className="px-2 py-1.5 text-center text-[11px] text-muted-foreground border-t border-border/40">
              Hiển thị {MAX_DISPLAYED_OPTIONS}/{filteredOptions.length} lựa chọn. Gõ để tìm kiếm thêm…
            </div>
          )}
          {canAddCustom && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                const customVal = search.trim().toUpperCase();
                toggle(customVal);
                setSearch("");
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs text-primary font-medium border-t border-border/40 mt-1"
            >
              <span>+ Lọc theo &ldquo;{search.trim().toUpperCase()}&rdquo;</span>
            </DropdownMenuItem>
          )}
          {filteredOptions.length === 0 && !canAddCustom && (
            <div className="py-3 text-center text-xs text-muted-foreground">
              Không có lựa chọn phù hợp
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {!isAll && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange([]);
          }}
          aria-label={`Bỏ lọc ${title.toLowerCase()}`}
          title={`Bỏ lọc ${title.toLowerCase()}`}
          className="flex h-8 w-6 items-center justify-center border-l border-input/60 rounded-r-md text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors shrink-0"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
