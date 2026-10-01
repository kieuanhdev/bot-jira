"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { bulkKeys } from "@/lib/query-keys";

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
  const [highlighted, setHighlighted] = useState(0);
  const [selectedDisplay, setSelectedDisplay] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const query = search.trim();
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
    if (!open || users.length === 0) {
      if (e.key === "Escape" && value) {
        clearValue();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % users.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + users.length) % users.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = users[highlighted];
      if (selected) selectUser(selected);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedDisplay(null);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Input
          className="h-8 text-xs pr-7"
          placeholder={placeholder}
          value={open ? search : displayValue}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlighted(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setSearch("");
            setSelectedDisplay(null);
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 200);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        {value && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
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

      {open && shouldFetch && (
        <div className="absolute z-50 mt-1 max-h-52 w-full min-w-[180px] overflow-auto rounded-md border bg-popover shadow-md">
          {isFetching ? (
            <div className="p-2 space-y-1.5">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Không tìm thấy user phù hợp
            </div>
          ) : (
            <ul role="listbox">
              {users.map((user, idx) => (
                <li
                  key={user.id}
                  role="option"
                  aria-selected={idx === highlighted}
                  className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs transition-colors ${
                    idx === highlighted ? "bg-accent" : ""
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectUser(user);
                  }}
                  onMouseEnter={() => setHighlighted(idx)}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium">
                      {user.displayName?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate leading-tight">{user.displayName}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">@{user.username}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
