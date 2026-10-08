"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";
import { api } from "@/lib/api-client";
import { issuesKeys, transitionsKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toName } from "./lib/quick-panel-utils";

const POINT_STEPS = [1, 2, 3, 5, 8, 13, 21];

function CellTrigger({ children, label }: { children: ReactNode; label: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2 py-1 text-left font-medium text-foreground shadow-xs transition-colors duration-150 hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-primary data-[state=open]:bg-primary/10"
      >
        <span className="whitespace-nowrap">{children}</span>
        <ChevronDown
          aria-hidden
          className="h-4 w-4 shrink-0 text-primary transition-colors group-data-[state=open]:text-primary"
        />
      </button>
    </DropdownMenuTrigger>
  );
}

/** Search box for long menus; swallows keys so Radix typeahead doesn't steal them. */
function MenuSearch({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  // Radix focuses the menu itself on open; take focus back once it has.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [inputRef]);
  return (
    <div className="sticky top-0 z-10 -mx-1 -mt-1 mb-1 flex items-center gap-1.5 border-b bg-popover px-2 py-1.5">
      <Search aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") e.stopPropagation();
        }}
        placeholder="Tìm kiếm…"
        aria-label="Tìm kiếm"
        className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

const norm = (v: string) => v.toLowerCase();

function MenuLoading() {
  return (
    <div className="space-y-1.5 p-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function StatusCell({
  jiraKey,
  status,
  onTransition,
}: {
  jiraKey: string;
  status: string;
  onTransition: (transitionId: string, toStatus: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: transitionsKeys.forIssue(jiraKey),
    queryFn: () =>
      api<{ transitions: { id: string; to?: { name?: string } | string }[] }>(
        `/api/issues/${jiraKey}/transitions`
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const items = data?.transitions ?? [];
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <CellTrigger label={`Đổi trạng thái ${jiraKey}`}>{status}</CellTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {isLoading ? (
          <MenuLoading />
        ) : isError ? (
          <div className="px-2 py-1.5 text-xs text-destructive">Không tải được trạng thái</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Không có chuyển đổi khả dụng</div>
        ) : (
          items.map((t) => (
            <DropdownMenuItem key={t.id} className="text-xs" onClick={() => onTransition(t.id, toName(t))}>
              {toName(t)}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-select dropdown over a string list; `display` overrides the trigger label. */
export function SelectCell({
  label,
  value,
  options,
  onChange,
  clearLabel,
  display,
}: {
  label: string;
  value: string | null | undefined;
  options: readonly string[];
  onChange: (value: string | null) => void;
  /** When set, a first item clears the field (onChange(null)). */
  clearLabel?: string;
  display?: ReactNode;
}) {
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const all = value && !options.includes(value) ? [value, ...options] : options;
  const searchable = all.length > 7;
  const list = q ? all.filter((o) => norm(o).includes(norm(q))) : all;
  return (
    <DropdownMenu onOpenChange={(o) => !o && setQ("")}>
      <CellTrigger label={label}>{display ?? value ?? "—"}</CellTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-56 overflow-y-auto"
      >
        {searchable && <MenuSearch value={q} onChange={setQ} inputRef={searchRef} />}
        {clearLabel && !q && (
          <>
            <DropdownMenuItem className="text-xs" onClick={() => onChange(null)}>
              {clearLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {list.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {q ? "Không tìm thấy" : "Chưa có lựa chọn"}
          </div>
        )}
        {list.map((o) => (
          <DropdownMenuItem
            key={o}
            className={cn("text-xs", o === value && "font-semibold text-primary")}
            onClick={() => onChange(o)}
          >
            {o}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DateCell({
  label,
  value,
  onChange,
  display,
  danger,
}: {
  label: string;
  /** ISO date/datetime or null. */
  value: string | null | undefined;
  /** YYYY-MM-DD, or null to clear. */
  onChange: (date: string | null) => void;
  display?: ReactNode;
  danger?: boolean;
}) {
  return (
    <DropdownMenu>
      <CellTrigger label={label}>
        <span className={cn(danger && "text-destructive")}>
          {display ?? (value ? new Date(value).toLocaleDateString("vi-VN") : "—")}
        </span>
      </CellTrigger>
      <DropdownMenuContent align="start" className="w-48 p-2">
        <input
          type="date"
          aria-label={label}
          defaultValue={value ? value.slice(0, 10) : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        />
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-7 w-full justify-start px-2 text-xs text-destructive"
          onClick={() => onChange(null)}
        >
          Xóa ngày
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PointsCell({
  jiraKey,
  value,
  onChange,
  display,
}: {
  jiraKey: string;
  value: number | null;
  onChange: (points: number | null) => void;
  display?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <CellTrigger label={`Đổi điểm ${jiraKey}`}>
        <span className="tabular-nums">{display ?? value ?? "—"}</span>
      </CellTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <div className="grid grid-cols-4 gap-1 p-1">
          {POINT_STEPS.map((p) => (
            <Button
              key={p}
              variant={value === p ? "default" : "outline"}
              size="sm"
              className="h-7 px-0 text-xs"
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs text-destructive" onClick={() => onChange(null)}>
          Xóa điểm
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FixVersionCell({
  jiraKey,
  names,
  onToggle,
  display,
}: {
  jiraKey: string;
  names: string[];
  onToggle: (version: string, selected: boolean) => void;
  display?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: issuesKeys.versions(jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${jiraKey}/versions`),
    enabled: open,
    staleTime: 60_000,
  });
  const allItems = data?.items ?? [];
  const items = q ? allItems.filter((v) => norm(v.name).includes(norm(q))) : allItems;
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <CellTrigger label={`Đổi phiên bản ${jiraKey}`}>{display ?? (names.join(", ") || "—")}</CellTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-60 overflow-y-auto"
      >
        <MenuSearch value={q} onChange={setQ} inputRef={searchRef} />
        {isLoading ? (
          <MenuLoading />
        ) : isError ? (
          <div className="px-2 py-1.5 text-xs text-destructive">Không tải được phiên bản</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{q ? "Không tìm thấy" : "Dự án chưa có phiên bản"}</div>
        ) : (
          items.map((v) => (
            <DropdownMenuCheckboxItem
              key={v.id}
              className="text-xs"
              checked={names.includes(v.name)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(checked) => onToggle(v.name, checked === true)}
            >
              {v.name}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
