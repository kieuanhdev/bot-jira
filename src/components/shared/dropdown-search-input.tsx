"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Sticky search input designed for DropdownMenuContent / Popover lists.
 * - Stops key propagation (except Escape) so Radix typeahead doesn't steal keystrokes.
 * - Stops click/pointer propagation so clicking the input doesn't trigger menu selection.
 * - Includes a clear button (X) when there is text.
 * - Auto-focuses on open.
 */
export function DropdownSearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm…",
  ariaLabel = "Tìm kiếm",
  className,
  autoFocus = true,
}: DropdownSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  return (
    <div
      className={cn(
        "sticky top-0 z-10 -mx-1 -mt-1 mb-1 flex items-center gap-1.5 border-b border-border/70 bg-popover px-2.5 py-1.5 shadow-xs",
        className
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key !== "Escape") {
          e.stopPropagation();
        }
      }}
    >
      <Search
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Xóa tìm kiếm"
          className="cursor-pointer rounded-xs p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
