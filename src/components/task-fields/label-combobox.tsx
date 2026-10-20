"use client";

import { useId, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkKeys } from "@/lib/query-keys";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { addLabel, buildLabelOptions } from "./lib/label-options";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { X, Tag } from "lucide-react";

interface LabelComboboxProps {
  projectKey: string;
  value?: string[];
  onChange: (labels: string[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

export function LabelCombobox({
  projectKey,
  value = [],
  onChange,
  placeholder = "Thêm nhãn…",
  disabled,
  className,
  compact,
}: LabelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const typed = inputValue.trim();
  const debouncedQuery = useDebouncedValue(typed, 250);

  const { data: suggestions, isFetching } = useQuery({
    queryKey: bulkKeys.createLabels(projectKey, debouncedQuery),
    queryFn: async () => {
      const res = await api<{ labels: string[] }>(
        `/api/bulk/create/labels?project=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(debouncedQuery)}&limit=20`
      );
      return res.labels;
    },
    enabled: open && projectKey.length > 0,
    staleTime: 60_000,
  });

  const options = buildLabelOptions(inputValue, suggestions ?? [], value);
  const showList = open && (options.length > 0 || isFetching);
  const activeValue = options.some((o) => o.value === highlighted)
    ? highlighted
    : (options[0]?.value ?? "");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setInputValue("");
  }

  function commitLabel(label: string) {
    const next = addLabel(value, label);
    if (next !== value) onChange(next);
    setInputValue("");
    setHighlighted("");
    inputRef.current?.focus();
  }

  function removeLabel(label: string) {
    const next = value.filter((v) => v !== label);
    onChange(next.length > 0 ? next : undefined);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ",") {
      e.preventDefault();
      commitLabel(activeValue || inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeLabel(value[value.length - 1]);
    }
  };

  const inputHeight = compact ? "h-8" : "h-9";

  return (
    <Popover open={showList} onOpenChange={handleOpenChange}>
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={setHighlighted}
        className="h-auto overflow-visible bg-transparent"
      >
        <PopoverAnchor asChild>
          <div
            className={`relative flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 transition-colors focus-within:ring-1 focus-within:ring-ring ${inputHeight} ${
              disabled ? "opacity-50" : "cursor-text"
            } ${className ?? ""}`}
            onClick={() => {
              if (!disabled) {
                setOpen(true);
                inputRef.current?.focus();
              }
            }}
          >
            {value.map((label) => (
              <Badge
                key={label}
                variant="secondary"
                className="gap-1 rounded px-1.5 py-0 text-2xs font-medium"
              >
                <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                {label}
                {!disabled && (
                  <button
                    type="button"
                    className="ml-0.5 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLabel(label);
                    }}
                    aria-label={`Xóa nhãn ${label}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </Badge>
            ))}

            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showList}
              aria-controls={listId}
              aria-autocomplete="list"
              className={`min-w-[60px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground ${inputHeight}`}
              placeholder={value.length === 0 ? placeholder : ""}
              value={inputValue}
              disabled={disabled}
              onChange={(e) => {
                setInputValue(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[160px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement | null)?.getAttribute("role") === "combobox") e.preventDefault();
          }}
        >
          {isFetching && options.length === 0 ? (
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : (
            <CommandList id={listId} className="max-h-48 p-0">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => commitLabel(option.value)}
                  className="gap-2 rounded-none px-2.5 py-1.5 text-xs"
                >
                  <Tag className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className={`truncate ${option.isNew ? "font-medium text-primary" : ""}`}>
                    {option.value}
                  </span>
                  {option.isNew && (
                    <span className="ml-auto text-2xs text-muted-foreground">Tạo mới</span>
                  )}
                </CommandItem>
              ))}
            </CommandList>
          )}
        </PopoverContent>
      </Command>
    </Popover>
  );
}
