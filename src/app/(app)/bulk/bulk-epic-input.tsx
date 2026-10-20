"use client";

import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { bulkKeys } from "@/lib/query-keys";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

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
  const [highlighted, setHighlighted] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const listId = useId();

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
  const activeValue = suggestions.some((i) => i.key === highlighted) ? highlighted : (suggestions[0]?.key ?? "");

  function pick(key: string) {
    onChange(key);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={setHighlighted}
        className="relative h-auto overflow-visible bg-transparent"
      >
        <PopoverAnchor asChild>
          <Input
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            value={value}
            disabled={disabled}
            placeholder={`Chọn hoặc nhập mã Epic (${projectKey}-...)`}
            onChange={(e) => {
              onChange(e.target.value.toUpperCase());
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setQuery(value);
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement | null)?.getAttribute("role") === "combobox") e.preventDefault();
          }}
        >
          {isLoading ? (
            <div className="space-y-1.5 p-2" aria-label="Đang tìm kiếm Epic / Task...">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : suggestions.length === 0 ? (
            <div className="py-2.5 px-3 text-center text-xs text-muted-foreground">
              Không tìm thấy Epic phù hợp. Bạn vẫn có thể nhập trực tiếp mã task (ví dụ: {projectKey}-100).
            </div>
          ) : (
            <CommandList id={listId} className="max-h-60 py-1">
              {suggestions.map((item) => (
                <CommandItem
                  key={item.key}
                  value={item.key}
                  onSelect={() => pick(item.key)}
                  className="justify-between gap-2 rounded-none px-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-primary shrink-0">{item.key}</span>
                    <span className="truncate text-muted-foreground">{item.summary}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge variant="outline" className="text-2xs px-1.5 py-0.5">
                      {item.issueTypeName}
                    </Badge>
                    <span className="text-2xs text-muted-foreground">{item.status}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </PopoverContent>
      </Command>
    </Popover>
  );
}
