"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { X, Layers, Check, Search } from "lucide-react";

export interface ComponentOption {
  id: string;
  name: string;
  description?: string;
}

interface ComponentsComboboxProps {
  options: ComponentOption[];
  value?: string[];
  onChange: (componentIds: string[] | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

export function ComponentsCombobox({
  options = [],
  value = [],
  onChange,
  placeholder = "Chọn hợp phần…",
  disabled = false,
  className = "",
  compact = false,
}: ComponentsComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearchQuery("");
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedOptions = options.filter((o) => value.includes(o.id));

  const filteredOptions = options.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return o.name.toLowerCase().includes(q) || (o.description && o.description.toLowerCase().includes(q));
  });

  function toggleComponent(id: string) {
    if (value.includes(id)) {
      const next = value.filter((v) => v !== id);
      onChange(next.length > 0 ? next : undefined);
    } else {
      onChange([...value, id]);
    }
    inputRef.current?.focus();
  }

  function removeComponent(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const next = value.filter((v) => v !== id);
    onChange(next.length > 0 ? next : undefined);
  }

  if (compact) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        <button
          type="button"
          disabled={disabled || options.length === 0}
          onClick={() => setOpen(!open)}
          className="flex h-7 w-full items-center justify-between rounded border border-input bg-transparent px-2 py-0.5 text-[11px] hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex items-center gap-1 overflow-hidden truncate">
            <Layers className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
            {selectedOptions.length === 0 ? (
              <span className="text-muted-foreground">{options.length === 0 ? "Không có comp" : placeholder}</span>
            ) : (
              <span className="font-medium text-foreground truncate">
                {selectedOptions.map((o) => o.name).join(", ")}
              </span>
            )}
          </div>
          {selectedOptions.length > 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground font-mono">
              ({selectedOptions.length})
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-56 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {options.length > 5 && (
              <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-1 mb-1">
                <Search className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm hợp phần…"
                  className="w-full bg-transparent text-[11px] outline-hidden placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div className="space-y-0.5">
              {filteredOptions.length === 0 ? (
                <div className="p-2 text-center text-[11px] text-muted-foreground">
                  Không tìm thấy hợp phần
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isChecked = value.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleComponent(opt.id)}
                      className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                    >
                      <div className="truncate">
                        <div className="font-medium text-foreground">{opt.name}</div>
                        {opt.description && (
                          <div className="text-[10px] text-muted-foreground truncate">{opt.description}</div>
                        )}
                      </div>
                      {isChecked && <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => {
          if (!disabled && options.length > 0) setOpen(true);
        }}
        className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs shadow-xs transition-colors ${
          open ? "ring-2 ring-primary/20 border-primary" : "hover:border-border/80"
        } ${disabled || options.length === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />

        {selectedOptions.length === 0 ? (
          <span className="text-muted-foreground">
            {options.length === 0 ? "Dự án chưa có Hợp phần (Components)" : placeholder}
          </span>
        ) : (
          selectedOptions.map((opt) => (
            <Badge
              key={opt.id}
              variant="outline"
              className="gap-1 pl-1.5 pr-1 py-0.5 text-[11px] bg-muted/40 font-normal hover:bg-muted/70"
            >
              <span>{opt.name}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => removeComponent(e, opt.id)}
                  className="rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" aria-hidden="true" />
                </button>
              )}
            </Badge>
          ))
        )}
      </div>

      {open && options.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-60 w-full min-w-[220px] overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5 mb-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm hợp phần…"
              className="w-full bg-transparent text-xs outline-hidden placeholder:text-muted-foreground"
            />
          </div>
          <div className="space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Không tìm thấy hợp phần khớp
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isChecked = value.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleComponent(opt.id)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                      isChecked ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-foreground"
                    }`}
                  >
                    <div className="truncate pr-2">
                      <div className="truncate">{opt.name}</div>
                      {opt.description && (
                        <div className="text-[10px] text-muted-foreground truncate">{opt.description}</div>
                      )}
                    </div>
                    {isChecked && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
