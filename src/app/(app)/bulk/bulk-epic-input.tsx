"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { bulkKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

type ParentSearchResult = {
  key: string;
  summary: string;
  issueTypeName: string;
  status: string;
};

export function EpicInput({
  projectKey,
  value,
  onChange,
  disabled = false,
}: {
  projectKey: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const { data: parentData, isLoading } = useQuery({
    queryKey: bulkKeys.createParentIssues(projectKey, debouncedQuery),
    queryFn: async () => {
      const res = await fetch(
        `/api/bulk/create/parents?project=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(debouncedQuery)}&limit=15`
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json.issues ?? []) as ParentSearchResult[];
    },
    enabled: Boolean(projectKey) && open,
    staleTime: 30_000,
  });

  const suggestions = parentData ?? [];

  function pick(key: string) {
    onChange(key);
    setOpen(false);
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="bulk-epic-options"
        value={value}
        disabled={disabled}
        placeholder={`Chọn hoặc nhập mã Epic (${projectKey}-...)`}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery(value);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (suggestions[highlight]) {
              pick(suggestions[highlight].key);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div
          id="bulk-epic-options"
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Đang tìm kiếm Epic / Task...</span>
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-2.5 px-3 text-center text-xs text-muted-foreground">
              Không tìm thấy Epic phù hợp. Bạn vẫn có thể nhập trực tiếp mã task (ví dụ: {projectKey}-100).
            </div>
          ) : (
            <ul className="py-1">
              {suggestions.map((item, i) => (
                <li key={item.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(item.key);
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-semibold text-primary shrink-0">{item.key}</span>
                      <span className="truncate text-muted-foreground">{item.summary}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {item.issueTypeName}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{item.status}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
