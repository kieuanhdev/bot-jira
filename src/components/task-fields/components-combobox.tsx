"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Layers, Check } from "lucide-react";

export interface ComponentOption {
  id: string;
  name: string;
  description?: string;
}

interface ComponentsComboboxProps {
  options: ComponentOption[];
  value?: string[];
  onChange: (componentIds: string[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

const COMPACT_SEARCH_THRESHOLD = 5;

export function ComponentsCombobox({
  options = [],
  value = [],
  onChange,
  placeholder = "Chọn hợp phần…",
  disabled = false,
  className = "",
  compact = false,
}: ComponentsComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedOptions = options.filter((o) => value.includes(o.id));
  const unavailable = disabled || options.length === 0;
  const showSearch = !compact || options.length > COMPACT_SEARCH_THRESHOLD;

  function toggleComponent(id: string) {
    if (value.includes(id)) {
      const next = value.filter((v) => v !== id);
      onChange(next.length > 0 ? next : undefined);
    } else {
      onChange([...value, id]);
    }
  }

  function removeComponent(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const next = value.filter((v) => v !== id);
    onChange(next.length > 0 ? next : undefined);
  }

  const list = (
    <Command className="rounded-lg">
      {showSearch && (
        <CommandInput placeholder={compact ? "Tìm hợp phần…" : "Tìm kiếm hợp phần…"} />
      )}
      <CommandList className={compact ? "max-h-56" : "max-h-60"}>
        <CommandEmpty className="p-3 text-xs">Không tìm thấy hợp phần</CommandEmpty>
        <CommandGroup className="p-1">
          {options.map((opt) => {
            const isChecked = value.includes(opt.id);
            return (
              <CommandItem
                key={opt.id}
                value={opt.id}
                keywords={[opt.name, opt.description ?? ""]}
                onSelect={() => toggleComponent(opt.id)}
                className="justify-between text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{opt.name}</div>
                  {opt.description && (
                    <div className="truncate text-2xs text-muted-foreground">{opt.description}</div>
                  )}
                </div>
                {isChecked && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
          <button
            type="button"
            disabled={unavailable}
            className={`flex h-8 w-full items-center justify-between rounded border border-input bg-card px-2 py-1 text-xs hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${className}`}
          >
            <div className="flex items-center gap-1 overflow-hidden truncate">
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {selectedOptions.length === 0 ? (
                <span className="text-muted-foreground">{options.length === 0 ? "Không có comp" : placeholder}</span>
              ) : (
                <span className="font-medium text-foreground truncate">
                  {selectedOptions.map((o) => o.name).join(", ")}
                </span>
              )}
            </div>
            {selectedOptions.length > 0 && (
              <span className="ml-1 text-2xs text-muted-foreground font-mono">
                ({selectedOptions.length})
              </span>
            )}
          </button>
        </PopoverTrigger>
      <PopoverContent className="w-56 p-0">{list}</PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={`relative flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs shadow-xs transition-colors ${
            open ? "ring-2 ring-primary/20 border-primary" : "hover:border-border/80"
          } ${unavailable ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${className}`}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={unavailable}
              aria-label={placeholder}
              className="absolute inset-0 rounded-md disabled:cursor-not-allowed cursor-pointer"
            />
          </PopoverTrigger>
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />

          {selectedOptions.length === 0 ? (
            <span className="text-muted-foreground">
              {options.length === 0 ? "Dự án chưa có Hợp phần (Components)" : placeholder}
            </span>
          ) : (
            selectedOptions.map((opt) => (
              <Badge
                key={opt.id}
                variant="outline"
                className="relative gap-1 pl-1.5 pr-1 py-0.5 text-2xs bg-muted/40 font-normal hover:bg-muted/70"
              >
                <span>{opt.name}</span>
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Bỏ ${opt.name}`}
                    onClick={(e) => removeComponent(e, opt.id)}
                    className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                )}
              </Badge>
            ))
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[220px] p-0">{list}</PopoverContent>
    </Popover>
  );
}
