"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Minimize2,
  ArrowRight,
  Loader2,
  Check,
  FolderKanban,
} from "lucide-react";

interface BulkCreateEditorTopbarProps {
  projectKey: string;
  totalRows: number;
  filledCount: number;
  isSavingDraft: boolean;
  draftSavedTime: number | null;
  onExitFullscreen: () => void;
  onPreview: () => void;
  isPreviewPending: boolean;
}

export function BulkCreateEditorTopbar({
  projectKey,
  totalRows,
  filledCount,
  isSavingDraft,
  draftSavedTime,
  onExitFullscreen,
  onPreview,
  isPreviewPending,
}: BulkCreateEditorTopbarProps) {
  function formatSavedTime(ts: number | null) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-xs select-none">
      {/* Left: Exit button & project / task stats */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExitFullscreen}
          title="Thoát chế độ toàn màn hình"
          className="h-8 gap-1.5 px-2.5 text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground"
        >
          <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Thoát toàn màn hình</span>
        </Button>

        <div className="h-4 w-px bg-border hidden sm:block" aria-hidden="true" />

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 border-primary/30 text-primary flex items-center gap-1">
            <FolderKanban className="h-3 w-3" aria-hidden="true" />
            {projectKey}
          </Badge>

          <Badge variant={filledCount > 0 ? "info" : "secondary"} className="text-xs px-2 py-0.5">
            {filledCount} / {totalRows} task sẵn sàng
          </Badge>
        </div>
      </div>

      {/* Middle: Autosave status indicator */}
      <div className="hidden md:flex items-center gap-2 text-xs">
        {isSavingDraft ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-amber-500" aria-hidden="true" />
            <span>Đang lưu bản nháp…</span>
          </span>
        ) : draftSavedTime ? (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
            <span>Đã lưu lúc {formatSavedTime(draftSavedTime)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground/60">Tự động lưu bản nháp</span>
        )}
      </div>

      {/* Right: Primary Preview CTA */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={onPreview}
          disabled={filledCount === 0 || isPreviewPending}
          className="h-8 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold cursor-pointer shadow-xs"
        >
          {isPreviewPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>Đang kiểm tra...</span>
            </>
          ) : (
            <>
              <span>Kiểm tra & Xem trước {filledCount} task</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
