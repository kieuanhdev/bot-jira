"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DropdownSearchInput } from "@/components/shared/dropdown-search-input";
import { cn } from "@/lib/utils";

export interface VersionPickerDropdownProps {
  versions: { id: string; name: string }[];
  onSelect: (name: string) => void;
  placeholder?: string;
  triggerClassName?: string;
}

export function VersionPickerDropdown({
  versions,
  onSelect,
  placeholder = "Chọn version…",
  triggerClassName,
}: VersionPickerDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isSearchable = versions.length > 5;
  const query = search.trim().toLowerCase();
  const filtered = query
    ? versions.filter((v) => v.name.toLowerCase().includes(query))
    : versions;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-36 cursor-pointer items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs font-medium hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            triggerClassName
          )}
        >
          <span className="truncate text-muted-foreground">{placeholder}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 max-h-64 overflow-y-auto">
        {isSearchable && (
          <DropdownSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Tìm version…"
          />
        )}
        {filtered.length === 0 ? (
          <div className="px-2 py-2 text-center text-xs text-muted-foreground">
            {search ? `Không tìm thấy "${search}"` : "Không có version"}
          </div>
        ) : (
          filtered.map((pv) => (
            <DropdownMenuItem
              key={pv.id}
              onClick={() => {
                onSelect(pv.name);
                setOpen(false);
              }}
              className="text-xs cursor-pointer"
            >
              {pv.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
