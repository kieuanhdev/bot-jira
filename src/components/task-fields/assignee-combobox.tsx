"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkKeys } from "@/lib/query-keys";
import { JiraAvatar } from "@/components/jira-avatar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type AssigneeOption = {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
};

type AssigneeComboboxProps = {
  projectKey: string;
  value?: string | null;
  onChange: (username: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

export function AssigneeCombobox({
  projectKey,
  value,
  onChange,
  placeholder = "Tìm assignee…",
  disabled,
  className,
}: AssigneeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState("");
  const [selectedDisplay, setSelectedDisplay] = useState<string | null>(null);

  const typed = search.trim();
  const query = useDebouncedValue(typed, 250);
  const shouldFetch = open && query.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: bulkKeys.createAssignees(projectKey, query),
    queryFn: async () => {
      const res = await api<{ users: AssigneeOption[] }>(
        `/api/bulk/create/assignees?project=${encodeURIComponent(projectKey)}&q=${encodeURIComponent(query)}&limit=20`
      );
      return res.users;
    },
    enabled: shouldFetch,
    staleTime: 30_000,
  });

  const users = data ?? [];
  const pending = isFetching || query !== typed;
  const showList = open && typed.length >= 2;
  const activeValue = users.some((u) => u.username === highlighted) ? highlighted : (users[0]?.username ?? "");

  const displayValue = selectedDisplay ?? value ?? "";

  const selectUser = (user: AssigneeOption) => {
    onChange(user.username);
    setSelectedDisplay(user.displayName);
    setOpen(false);
    setSearch("");
  };

  const clearValue = () => {
    onChange(null);
    setSelectedDisplay(null);
    setSearch("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !showList && value) {
      clearValue();
    }
  };

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={setHighlighted}
        className={`relative h-auto overflow-visible bg-transparent ${className ?? ""}`}
      >
        <PopoverAnchor asChild>
          <div className="relative">
            <Input
              role="combobox"
              aria-expanded={showList}
              aria-autocomplete="list"
              className="h-8 text-xs pr-7"
              placeholder={placeholder}
              value={open ? search : displayValue}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                setSearch("");
                setSelectedDisplay(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={disabled}
            />
            {value && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                onClick={clearValue}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="Xóa assignee"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </PopoverAnchor>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[180px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement | null)?.getAttribute("role") === "combobox") e.preventDefault();
          }}
        >
          {pending ? (
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Không tìm thấy user phù hợp
            </div>
          ) : (
            <CommandList className="max-h-52 p-0">
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.username}
                  onSelect={() => selectUser(user)}
                  className="gap-2 rounded-none px-2.5 text-xs"
                >
                  <JiraAvatar
                    username={user.username}
                    displayName={user.displayName}
                    avatarUrl={user.avatar}
                    size="sm"
                    className="shrink-0"
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate leading-tight">{user.displayName}</span>
                    <span className="text-2xs text-muted-foreground leading-tight">@{user.username}</span>
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
