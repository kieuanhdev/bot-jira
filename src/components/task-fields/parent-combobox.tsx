"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ListTree, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { filterBatchParentCandidates, MIN_PARENT_QUERY_LENGTH, type ParentCandidate } from "./lib/parent-options";
import { bulkKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { BulkParentRef, BulkCreateRowInput } from "@/lib/bulk/create-types";

export type { ParentCandidate };

export interface ParentComboboxProps {
  projectKey: string;
  value: BulkParentRef | null | undefined;
  onChange: (parent: BulkParentRef | null) => void;
  /** Candidates in the batch for parent options (computed once at grid level) */
  parentCandidates?: ParentCandidate[];
  /** All items in the batch for "in batch" parent options. */
  batchItems?: BulkCreateRowInput[];
  /** The clientRef of the current row (to exclude self). */
  currentClientRef?: string;
  /** Issue type IDs that are subtasks (to exclude from batch parent options). */
  subtaskIssueTypeIds?: Set<string>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
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
  parentCandidates,
  batchItems = [],
  currentClientRef = "",
  subtaskIssueTypeIds = new Set(),
  placeholder = "Chọn parent...",
  disabled,
  className,
  compact = false,
}: ParentComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const jiraQueryReady = debouncedQuery.trim().length >= MIN_PARENT_QUERY_LENGTH;

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
    enabled: open && jiraQueryReady,
    staleTime: 30_000,
  });

  // Only compute when the popover is open
  const batchParentOptions = open
    ? filterBatchParentCandidates({
        candidates: parentCandidates ?? batchItems.map((item) => ({ clientRef: item.clientRef, summary: item.summary })),
        batchItems: parentCandidates ? undefined : batchItems,
        query,
        currentClientRef,
        subtaskIssueTypeIds,
      })
    : [];

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function selectBatchParent(clientRef: string) {
    onChange({ type: "batch", clientRef });
    handleOpenChange(false);
  }

  function selectJiraParent(jiraKey: string) {
    onChange({ type: "jira", jiraKey });
    handleOpenChange(false);
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
  const jiraItems = jiraResults ?? [];

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className={`relative ${className ?? ""}`}>
        <div className="flex items-center gap-1">
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className={cn(compact ? "h-7" : "h-8", "w-full justify-between gap-1 text-xs cursor-pointer")}
            >
              <span className="truncate">{displayValue || <span className="text-muted-foreground">{placeholder}</span>}</span>
              {displayValue && (
                <span className="text-2xs text-muted-foreground">
                  {value?.type === "batch" ? <ListTree className="h-3 w-3" /> : <ExternalLink className="h-3 w-3" />}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          {displayValue && !disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearParent}
              className={cn(compact ? "h-7 w-6" : "h-8 w-7", "p-0 cursor-pointer text-muted-foreground hover:text-destructive")}
              title="Xóa parent"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Tìm task trong batch hoặc Jira..."
            className="h-9 text-xs"
          />
          <CommandList className="max-h-60">
            {batchParentOptions.length > 0 && (
              <CommandGroup heading="Trong batch này">
                {batchParentOptions.map((item) => (
                  <CommandItem
                    key={item.clientRef}
                    value={`batch:${item.clientRef}`}
                    onSelect={() => selectBatchParent(item.clientRef)}
                    className="gap-2 text-xs"
                  >
                    <ListTree className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      <span className="font-mono text-2xs text-muted-foreground mr-1">{item.clientRef}</span>
                      {item.summary || "(chưa có tiêu đề)"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {jiraQueryReady && (
              <CommandGroup heading="Trên Jira">
                {jiraLoading && (
                  <div className="space-y-1.5 px-2 py-1">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                  </div>
                )}
                {!jiraLoading &&
                  jiraItems.map((issue) => (
                    <CommandItem
                      key={issue.key}
                      value={`jira:${issue.key}`}
                      onSelect={() => selectJiraParent(issue.key)}
                      className="gap-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-primary shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        <span className="font-mono text-2xs text-primary mr-1">{issue.key}</span>
                        {issue.summary}
                      </span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{issue.status}</span>
                    </CommandItem>
                  ))}
                {!jiraLoading && jiraItems.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">Không tìm thấy issue phù hợp</div>
                )}
              </CommandGroup>
            )}

            {batchParentOptions.length === 0 && !jiraQueryReady && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Nhập ít nhất {MIN_PARENT_QUERY_LENGTH} ký tự để tìm task trong batch hoặc Jira
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
