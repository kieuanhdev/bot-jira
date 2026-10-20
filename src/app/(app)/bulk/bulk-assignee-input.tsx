"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { filterLocalOptions } from "@/components/task-fields/lib/filter-options";

export function AssigneeInput({
  value,
  onChange,
  options,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState("");
  const listId = useId();
  const matches = filterLocalOptions(options, value, 8);
  const activeValue = matches.includes(highlight) ? highlight : (matches[0] ?? "");
  const showList = open && matches.length > 0;

  function pick(opt: string) {
    onChange(opt);
    setOpen(false);
  }

  return (
    <Popover open={showList} onOpenChange={setOpen}>
      <Command
        shouldFilter={false}
        value={activeValue}
        onValueChange={setHighlight}
        className="h-auto overflow-visible bg-transparent"
      >
        <PopoverAnchor asChild>
          <div>
            <Input
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={listId}
              value={value}
              disabled={disabled}
              placeholder="jira username"
              onChange={(e) => {
                onChange(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </div>
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
          <CommandList id={listId} className="max-h-52 p-1">
            {matches.map((opt) => (
              <CommandItem key={opt} value={opt} onSelect={() => pick(opt)}>
                {opt}
              </CommandItem>
            ))}
          </CommandList>
        </PopoverContent>
      </Command>
    </Popover>
  );
}
