"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkKeys } from "@/lib/query-keys";
import { MAX_LABELS_COUNT, MAX_LABEL_LENGTH } from "@/lib/bulk/create-types";
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
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(inputValue.trim()), 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [inputValue]);

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

  // Filter out already-selected labels from suggestions
  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  // If input matches a suggestion exactly or is empty, show all suggestions
  const showSuggestionInput =
    inputValue.trim().length > 0 &&
    !filteredSuggestions.some((s) => s.toLowerCase() === inputValue.trim().toLowerCase());

  const displaySuggestions = showSuggestionInput
    ? [inputValue.trim(), ...filteredSuggestions]
    : filteredSuggestions;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setInputValue("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function addLabel(label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_LABEL_LENGTH) return;
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return;
    if (value.length >= MAX_LABELS_COUNT) return;
    onChange([...value, trimmed]);
    setInputValue("");
    setHighlighted(0);
    inputRef.current?.focus();
  }

  function removeLabel(label: string) {
    const next = value.filter((v) => v !== label);
    onChange(next.length > 0 ? next : undefined);
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const target = displaySuggestions[highlighted];
      if (target) addLabel(target);
      else if (inputValue.trim()) addLabel(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeLabel(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % Math.max(displaySuggestions.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + displaySuggestions.length) % Math.max(displaySuggestions.length, 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setInputValue("");
    }
  };

  const inputHeight = compact ? "h-8" : "h-9";

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-wrap items-center gap-1 rounded-md border border-border bg-background px-2 py-1 transition-colors focus-within:ring-1 focus-within:ring-ring ${inputHeight} ${
        disabled ? "opacity-50" : "cursor-text"
      } ${className ?? ""}`}
      onClick={() => {
        if (!disabled) {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      }}
    >
      {value.map((label) => (
        <Badge
          key={label}
          variant="secondary"
          className="gap-1 rounded px-1.5 py-0 text-[10px] font-medium"
        >
          <Tag className="h-2.5 w-2.5" aria-hidden="true" />
          {label}
          {!disabled && (
            <button
              type="button"
              className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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
        className={`min-w-[60px] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground ${inputHeight}`}
        placeholder={value.length === 0 ? placeholder : ""}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          setInputValue(e.target.value);
          setHighlighted(0);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {open && (displaySuggestions.length > 0 || isFetching) && (
        <div className="absolute z-50 mt-1 max-h-48 w-full min-w-[160px] overflow-auto rounded-md border bg-popover shadow-md">
          {isFetching && displaySuggestions.length === 0 ? (
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : (
            <ul role="listbox">
              {displaySuggestions.map((s, idx) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={idx === highlighted}
                  className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs transition-colors ${
                    idx === highlighted ? "bg-accent" : ""
                  } ${s === inputValue.trim() ? "font-medium text-primary" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addLabel(s);
                  }}
                  onMouseEnter={() => setHighlighted(idx)}
                >
                  <Tag className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{s}</span>
                  {s === inputValue.trim() && (
                    <span className="ml-auto text-[10px] text-muted-foreground">Tạo mới</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
