"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label (the field has no visible label). */
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Standard search input: leading magnifier icon, a clear (X) button that appears
 * only when there is a value, and a consistent height/typography. Controlled —
 * the caller owns the value (and any debounce; if debounce affects a query, that
 * hook stays on the page, not here).
 */
export function SearchField({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  ariaLabel = "Tìm kiếm",
  id,
  disabled,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-9 pl-8 pr-8 text-xs"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Xóa tìm kiếm"
          className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
