import {
  CornerDownLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Flag,
  MoreHorizontal,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QuickAction } from "../lib/board-types";
import { PRIORITIES, toName } from "../lib/quick-panel-utils";

interface QuickPanelFooterProps {
  watched: boolean;
  onToggleWatch: () => void;
  jiraUrl: string | null;
  assignees: string[];
  assigneeJira?: string | null;
  priority?: string | null;
  transitions: { id: string; to?: { name?: string } | string }[];
  onAction: (action: QuickAction) => void;
  onTransition: (transitionId: string) => void;
  onOpenFull: () => void;
}

export function QuickPanelFooter({
  watched,
  onToggleWatch,
  jiraUrl,
  assignees,
  assigneeJira,
  priority,
  transitions,
  onAction,
  onTransition,
  onOpenFull,
}: QuickPanelFooterProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleWatch}
        className="gap-1.5"
        title={watched ? "Stop watching" : "Watch"}
      >
        {watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        {watched ? "Watching" : "Watch"}
      </Button>

      {jiraUrl && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(jiraUrl, "_blank", "noopener");
          }}
          className="gap-1.5 cursor-pointer text-xs"
          title="Mở xem trên Jira"
        >
          <ExternalLink className="h-4 w-4" /> Xem trên Jira
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <MoreHorizontal className="h-4 w-4" /> More
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Assign to</DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              onAction({ kind: "assignee", value: null });
            }}
            className="gap-2"
          >
            <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> Unassigned
          </DropdownMenuItem>
          {assignees.slice(0, 12).map((a) => (
            <DropdownMenuItem
              key={a}
              onSelect={(e) => {
                e.preventDefault();
                onAction({ kind: "assignee", value: a });
              }}
              className="gap-2"
            >
              <User className="h-3.5 w-3.5" aria-hidden />
              <span className="truncate">{a}</span>
              {a === assigneeJira && <span className="ml-auto text-primary">•</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Priority</DropdownMenuLabel>
          {PRIORITIES.map((p) => (
            <DropdownMenuItem
              key={p}
              onSelect={(e) => {
                e.preventDefault();
                onAction({ kind: "priority", value: p });
              }}
              className="gap-2"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden /> {p}
              {p === priority && <span className="ml-auto text-primary">•</span>}
            </DropdownMenuItem>
          ))}
          {transitions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Move to…</DropdownMenuLabel>
              {transitions.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    onTransition(t.id);
                  }}
                  className="gap-2"
                >
                  <CornerDownLeft className="h-3.5 w-3.5" aria-hidden /> {toName(t)}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        className="ml-auto gap-1.5"
        onClick={onOpenFull}
        title="Open full detail"
      >
        <CornerDownLeft className="h-4 w-4" /> Full detail
      </Button>
    </div>
  );
}
