"use client";

import {
  CalendarDays,
  CornerDownLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  Link as LinkIcon,
  Link2,
  MoreHorizontal,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dueDatePresets } from "../lib/quick-panel-utils";

interface QuickPanelFooterProps {
  jiraKey: string;
  watched: boolean;
  onToggleWatch: () => void;
  jiraUrl: string | null;
  dueDate?: string | null;
  onSetDueDate: (dueDate: string | null) => void;
  flagged: boolean;
  onToggleFlag: () => void;
  onLogWork: () => void;
  onLinkIssue: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onOpenFull: () => void;
}

/**
 * The "More" menu holds only actions that have no other control in the panel.
 *
 * Status, assignee, priority and points live in the action bar and the Fields
 * list; clone and branch are buttons up there too; watch, "Xem trên Jira",
 * "Chi tiết" are buttons right here; copying the key is in the header. Repeating
 * any of them here is what made the old More menu useless.
 */
export function QuickPanelFooter({
  jiraKey,
  watched,
  onToggleWatch,
  jiraUrl,
  dueDate,
  onSetDueDate,
  flagged,
  onToggleFlag,
  onLogWork,
  onLinkIssue,
  onDelete,
  onCopyLink,
  onOpenFull,
}: QuickPanelFooterProps) {
  const presets = dueDatePresets();

  return (
    <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleWatch}
        className="cursor-pointer gap-1.5"
        title={watched ? "Bỏ theo dõi task này" : "Theo dõi task này"}
      >
        {watched ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
        {watched ? "Watching" : "Watch"}
      </Button>

      {jiraUrl && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(jiraUrl, "_blank", "noopener");
          }}
          className="cursor-pointer gap-1.5 text-xs"
          title="Mở xem trên Jira"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Xem trên Jira
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="cursor-pointer gap-1.5">
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
            {jiraKey}
          </DropdownMenuLabel>

          <DropdownMenuItem onSelect={onLogWork} className="cursor-pointer gap-2 text-xs">
            <Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Log work…
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={onLinkIssue} className="cursor-pointer gap-2 text-xs">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            Link issue…
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer text-xs">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              Due date
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {presets.map((preset) => (
                <DropdownMenuItem
                  key={preset.value}
                  onSelect={(e) => {
                    e.preventDefault();
                    onSetDueDate(preset.value);
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {preset.label}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {preset.value.slice(5)}
                  </span>
                </DropdownMenuItem>
              ))}
              {dueDate && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetDueDate(null);
                    }}
                    className="cursor-pointer text-xs text-destructive"
                  >
                    Clear due date
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onToggleFlag();
            }}
            className="cursor-pointer gap-2 text-xs"
            title="Thêm/bỏ nhãn Impediment trên Jira (không phải cờ Flagged của Jira)"
          >
            <Flag
              className={flagged ? "h-3.5 w-3.5 text-amber-500" : "h-3.5 w-3.5 text-muted-foreground"}
              aria-hidden="true"
            />
            {flagged ? "Remove label Impediment" : "Add label Impediment"}
          </DropdownMenuItem>

          {jiraUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onCopyLink} className="cursor-pointer gap-2 text-xs">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                Copy Jira link
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={onDelete}
            className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Xóa task…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        className="ml-auto cursor-pointer gap-1.5"
        onClick={onOpenFull}
        title="Mở trang chi tiết"
      >
        <CornerDownLeft className="h-4 w-4" aria-hidden="true" /> Full detail
      </Button>
    </div>
  );
}
