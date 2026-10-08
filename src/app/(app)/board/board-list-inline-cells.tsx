"use client";

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
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
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <DropdownMenu>
      <CellTrigger label={label}>{display ?? value ?? "—"}</CellTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-56 overflow-y-auto">
        {clearLabel && (
          <>
            <DropdownMenuItem className="text-xs" onClick={() => onChange(null)}>
              {clearLabel}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {list.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Chưa có lựa chọn</div>
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
  const { data, isLoading, isError } = useQuery({
    queryKey: issuesKeys.versions(jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${jiraKey}/versions`),
    enabled: open,
    staleTime: 60_000,
  });
  const items = data?.items ?? [];
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <CellTrigger label={`Đổi phiên bản ${jiraKey}`}>{display ?? (names.join(", ") || "—")}</CellTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-60 overflow-y-auto">
        {isLoading ? (
          <MenuLoading />
        ) : isError ? (
          <div className="px-2 py-1.5 text-xs text-destructive">Không tải được phiên bản</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Dự án chưa có phiên bản</div>
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
