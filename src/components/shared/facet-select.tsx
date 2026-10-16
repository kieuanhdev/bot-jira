"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL } from "@/lib/filters";
import { cn } from "@/lib/utils";

export interface FacetSelectOption<T extends string = string> {
  value: T;
  label: string;
  count?: number;
}

export interface FacetSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: FacetSelectOption<T>[];
  allLabel?: string;
  allValue?: T;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Standardized single-select facet dropdown ("Select + Tất cả").
 *
 * Supports semantic active tint when not set to allValue, display counts,
 * and standard accessible keyboard navigation.
 */
export function FacetSelect<T extends string = string>({
  value,
  onChange,
  options,
  allLabel = "Tất cả",
  allValue = ALL as unknown as T,
  placeholder,
  ariaLabel,
  className,
  disabled,
}: FacetSelectProps<T>) {
  const isAll = value === allValue;
  const currentOption = options.find((o) => o.value === value);
  const displayLabel = isAll ? allLabel : currentOption ? currentOption.label : value;

  return (
    <Select
      value={value}
      onValueChange={(val) => onChange(val as T)}
      disabled={disabled}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          "h-9 cursor-pointer gap-1 px-2.5 text-xs transition-colors",
          !isAll && "border-primary/40 bg-primary/5 font-medium text-foreground",
          className
        )}
      >
        <SelectValue placeholder={placeholder ?? allLabel}>
          {displayLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={allValue} className="cursor-pointer text-xs">
          {allLabel}
        </SelectItem>
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className="cursor-pointer text-xs"
          >
            <span>{opt.label}</span>
            {typeof opt.count === "number" && (
              <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                ({opt.count})
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
