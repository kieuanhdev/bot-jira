"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ListTree, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkKeys } from "@/lib/query-keys";
import type { BulkParentRef, BulkCreateRowInput } from "@/lib/bulk/create-types";

interface ParentComboboxProps {
  projectKey: string;
  value: BulkParentRef | null | undefined;
  onChange: (parent: BulkParentRef | null) => void;
  /** All items in the batch for "in batch" parent options. */
  batchItems: BulkCreateRowInput[];
  /** The clientRef of the current row (to exclude self). */
  currentClientRef: string;
  /** Issue type IDs that are subtasks (to exclude from batch parent options). */
  subtaskIssueTypeIds: Set<string>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

type ParentSearchResult = {
  key: string;
  summary: string;
  issueTypeName: string;
  status: string;
};

export function ParentCombobox({
  projectKey,
  value,
  onChange,
  batchItems,
  currentClientRef,
  subtaskIssueTypeIds,
  placeholder = "Chọn parent...",
  disabled,
  className,
}: ParentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Debounce search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(query), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  // Fetch Jira parent issues when query changes
  const { data: jiraResults, isLoading: jiraLoading } = useQuery({
    queryKey: bulkKeys.createParentIssues(projectKey, debouncedQuery),
    queryFn: async () => {
      const res = await fetch(
        `/api/bulk/create/parents?project=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(debouncedQuery)}&limit=15`
      );
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      return json.issues as ParentSearchResult[];
    },
    enabled: open && debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Filter batch items that can be parents
  const batchParentOptions = batchItems
    .filter((item) => {
      if (item.clientRef === currentClientRef) return false;
      const ref = (item.clientRef || "").trim();
      if (!ref) return false;
      // Exclude subtasks from being parents
      if (item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId)) return false;
      // If query is set, filter by summary
      if (query && query.length >= 2) {
        const q = query.toLowerCase();
        const matchesSummary = (item.summary || "").toLowerCase().includes(q);
        const matchesRef = ref.toLowerCase().includes(q);
        if (!matchesSummary && !matchesRef) return false;
      }
      return true;
    })
    .slice(0, 10);

  function selectBatchParent(clientRef: string) {
    onChange({ type: "batch", clientRef });
    setOpen(false);
    setQuery("");
  }

  function selectJiraParent(jiraKey: string) {
    onChange({ type: "jira", jiraKey });
    setOpen(false);
    setQuery("");
  }

  function clearParent() {
    onChange(null);
    setQuery("");
  }

  const displayValue = value
    ? value.type === "batch"
      ? value.clientRef
      : value.jiraKey
    : "";

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setOpen(!open);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="h-8 w-full justify-between gap-1 text-xs cursor-pointer"
        >
          <span className="truncate">{displayValue || <span className="text-muted-foreground">{placeholder}</span>}</span>
          {displayValue && (
            <span className="text-[10px] text-muted-foreground">
              {value?.type === "batch" ? <ListTree className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
            </span>
          )}
        </Button>
        {displayValue && !disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearParent}
            className="h-8 w-7 p-0 cursor-pointer text-muted-foreground hover:text-destructive"
            title="Xóa parent"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-md border border-border bg-popover shadow-md">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-2 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm task trong batch hoặc Jira..."
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {/* Batch parent options */}
            {batchParentOptions.length > 0 && (
              <>
                <div className="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">
                  Trong batch này
                </div>
                {batchParentOptions.map((item) => (
                  <button
                    key={item.clientRef}
                    type="button"
                    onClick={() => selectBatchParent(item.clientRef!)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent cursor-pointer"
                  >
                    <ListTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      <span className="font-mono text-[10px] text-muted-foreground mr-1">{item.clientRef}</span>
                      {item.summary || "(chưa có tiêu đề)"}
                    </span>
                  </button>
                ))}
              </>
            )}

            {/* Jira parent options */}
            {debouncedQuery.length >= 2 && (
              <>
                <div className="mt-1 border-t border-border px-2 pt-1 pb-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  Trên Jira
                </div>
                {jiraLoading && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Đang tìm...</div>
                )}
                {!jiraLoading && (jiraResults ?? []).map((issue) => (
                  <button
                    key={issue.key}
                    type="button"
                    onClick={() => selectJiraParent(issue.key)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      <span className="font-mono text-[10px] text-primary mr-1">{issue.key}</span>
                      {issue.summary}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{issue.status}</span>
                  </button>
                ))}
                {!jiraLoading && (jiraResults ?? []).length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Không tìm thấy issue phù hợp</div>
                )}
              </>
            )}

            {/* No results */}
            {batchParentOptions.length === 0 && debouncedQuery.length < 2 && (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Không có task phù hợp trong batch
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
