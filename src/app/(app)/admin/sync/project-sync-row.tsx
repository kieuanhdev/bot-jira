"use client";

import { useState } from "react";
import {
  ChevronRight,
  FolderSync,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn, timeAgo, formatNumber } from "@/lib/utils";
import type { AdminProjectSyncRow, AdminSyncState } from "@/lib/admin/project-sync";
import { ALL_SYNC_FEATURES } from "@/lib/jira/sync-features-shared";
import { SyncSwitch } from "./sync-switch";

export const STATE_BADGE: Record<
  AdminSyncState,
  { label: string; variant: "success" | "warning" | "danger" | "info" | "secondary" }
> = {
  ok: { label: "Ổn định", variant: "success" },
  running: { label: "Đang đồng bộ", variant: "info" },
  failed: { label: "Lỗi", variant: "danger" },
  never: { label: "Chưa đồng bộ", variant: "secondary" },
  disabled: { label: "Đã tắt", variant: "warning" },
};

export interface ProjectSyncRowProps {
  project: AdminProjectSyncRow;
  isSelected: boolean;
  onToggleSelect: (checked: boolean) => void;
  isRowBusy: boolean;
  isAnyBusy: boolean;
  isSyncingNow: boolean;
  onSyncNow: () => void;
  onRequestFullSync: () => void;
  onOpenConfig: () => void;
  onRequestToggleSync: (next: boolean) => void;
}

export function ProjectSyncRow({
  project: p,
  isSelected,
  onToggleSelect,
  isRowBusy,
  isAnyBusy,
  isSyncingNow,
  onSyncNow,
  onRequestFullSync,
  onOpenConfig,
  onRequestToggleSync,
}: ProjectSyncRowProps) {
  const [hasExpandedError, setHasExpandedError] = useState(false);

  const badge = STATE_BADGE[p.state];
  const enabledFeaturesCount = ALL_SYNC_FEATURES.filter(
    (f) => p.features[f]
  ).length;

  return (
    <li
      className={cn(
        "flex flex-col gap-3 p-4 transition-colors duration-150 sm:flex-row sm:items-center",
        !p.syncEnabled && "bg-muted/30"
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="pt-0.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelect(Boolean(checked))}
            aria-label={`Chọn dự án ${p.key}`}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{p.key}</span>
            <span className="truncate text-sm text-muted-foreground">{p.name}</span>
            <Badge variant={badge.variant}>{badge.label}</Badge>

            {/* Preset badges */}
            {p.preset === "issues_comments" && (
              <Badge variant="secondary">Issue + bình luận</Badge>
            )}
            {p.preset === "issues_only" && (
              <Badge variant="outline">Chỉ issue</Badge>
            )}
            {p.preset === "custom" && (
              <Badge
                variant="outline"
                className="border-primary/40 text-primary font-medium"
              >
                Tuỳ chỉnh · {enabledFeaturesCount}/9
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>{formatNumber(p.issueCount)} issue</span>
            <span>
              · thành công {p.lastSuccessAt ? timeAgo(p.lastSuccessAt) : "chưa từng"}
            </span>
            {p.lastStartedAt && (
              <span>· chạy gần nhất {timeAgo(p.lastStartedAt)}</span>
            )}
          </div>
          {p.state === "failed" && p.lastError && (
            <div className="mt-1">
              <button
                type="button"
                onClick={() => setHasExpandedError((prev) => !prev)}
                className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-destructive transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-expanded={hasExpandedError}
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none",
                    hasExpandedError && "rotate-90"
                  )}
                  aria-hidden="true"
                />
                <span>
                  {hasExpandedError ? "Ẩn chi tiết lỗi" : "Xem chi tiết lỗi"}
                </span>
              </button>
              {hasExpandedError && (
                <pre className="mt-1.5 max-h-48 overflow-x-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 font-mono text-xs text-destructive">
                  {maskSecrets(p.lastError)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/* Desktop direct action buttons */}
        <div className="hidden items-center gap-2 sm:flex">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={!p.syncEnabled || isAnyBusy}
            onClick={onSyncNow}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                isRowBusy &&
                  isSyncingNow &&
                  "animate-spin motion-reduce:animate-none"
              )}
              aria-hidden="true"
            />
            Đồng bộ
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            disabled={!p.syncEnabled || isAnyBusy}
            onClick={onRequestFullSync}
          >
            Toàn bộ
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer gap-1.5 text-muted-foreground hover:text-foreground"
            disabled={isAnyBusy}
            onClick={onOpenConfig}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Cấu hình
          </Button>
        </div>

        {/* Mobile dropdown menu */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 cursor-pointer p-0"
                disabled={isAnyBusy}
              >
                <span className="sr-only">Thao tác cho {p.key}</span>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={!p.syncEnabled || isAnyBusy}
                onClick={onSyncNow}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Đồng bộ
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                disabled={!p.syncEnabled || isAnyBusy}
                onClick={onRequestFullSync}
              >
                <FolderSync className="h-4 w-4" aria-hidden="true" />
                Đồng bộ toàn bộ
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2"
                onClick={onOpenConfig}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Cấu hình đồng bộ
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <SyncSwitch
          checked={p.syncEnabled}
          disabled={isAnyBusy}
          label={p.syncEnabled ? `Tắt đồng bộ ${p.key}` : `Bật đồng bộ ${p.key}`}
          onChange={onRequestToggleSync}
        />
      </div>
    </li>
  );
}
