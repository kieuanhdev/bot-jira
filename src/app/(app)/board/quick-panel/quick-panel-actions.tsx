import {
  ChevronDown,
  CornerDownLeft,
  Flag,
  GitBranch,
  Hash,
  RefreshCw,
  User,
  UserCheck,
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
import { cn } from "@/lib/utils";
import { PRIORITIES, toName } from "../lib/quick-panel-utils";

interface QuickPanelActionsProps {
  status: string;
  dotClass: string;
  transitions: { id: string; to?: { name?: string } | string }[];
  onTransition: (transitionId: string) => void;
  assigneeJira?: string | null;
  assignees: string[];
  meName?: string | null;
  onAssign: (assignee: string | null) => void;
  points?: number | null;
  onSetPoints: (points: number | null) => void;
  priority?: string | null;
  onSetPriority: (priority: string) => void;
  creatingBranch: boolean;
  onCreateBranch: () => void;
  branchMsg: { type: "success" | "error"; text: string } | null;
}

export function QuickPanelActions({
  status,
  dotClass,
  transitions,
  onTransition,
  assigneeJira,
  assignees,
  meName,
  onAssign,
  points,
  onSetPoints,
  priority,
  onSetPriority,
  creatingBranch,
  onCreateBranch,
  branchMsg,
}: QuickPanelActionsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-4 py-2">
        {/* Status Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs font-medium">
              <span className={cn("h-2 w-2 rounded-full", dotClass)} />
              <span className="truncate max-w-[110px]">{status}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs">Chuyển trạng thái</DropdownMenuLabel>
            {transitions.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={() => onTransition(t.id)}
                className="gap-2 text-xs"
              >
                <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />
                {toName(t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Assignee Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate max-w-[100px]">{assigneeJira || "Chưa gán"}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Gán người thực hiện</DropdownMenuLabel>
            {meName && (
              <DropdownMenuItem
                onClick={() => onAssign(meName)}
                className="gap-2 text-xs font-medium text-primary"
              >
                <UserCheck className="h-3.5 w-3.5" /> Gán cho tôi ({meName})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onAssign(null)}
              className="gap-2 text-xs text-muted-foreground"
            >
              <User className="h-3.5 w-3.5" /> Chưa gán (Unassigned)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {assignees.map((a) => (
              <DropdownMenuItem
                key={a}
                onClick={() => onAssign(a)}
                className="gap-2 text-xs"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{a}</span>
                {a === assigneeJira && <span className="ml-auto text-primary">•</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quick "Gán cho tôi" button */}
        {meName && assigneeJira !== meName && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAssign(meName)}
            className="h-7 gap-1 px-2 text-xs text-primary hover:bg-primary/10"
            title={`Gán nhanh cho tôi (${meName})`}
          >
            <UserCheck className="h-3.5 w-3.5" />
            Gán cho tôi
          </Button>
        )}

        {/* Story Points Picker */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              {points != null ? `${points} pt` : "— pt"}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel className="text-xs">Đặt Story Points</DropdownMenuLabel>
            <div className="grid grid-cols-4 gap-1 p-1">
              {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                <Button
                  key={p}
                  variant={points === p ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-0 text-xs"
                  onClick={() => onSetPoints(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onSetPoints(null)}
              className="text-xs text-destructive"
            >
              Xóa điểm (None)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Priority Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <Flag className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{priority || "Priority"}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            <DropdownMenuLabel className="text-xs">Độ ưu tiên</DropdownMenuLabel>
            {PRIORITIES.map((p) => (
              <DropdownMenuItem
                key={p}
                onClick={() => onSetPriority(p)}
                className="gap-2 text-xs"
              >
                <Flag className="h-3.5 w-3.5" /> {p}
                {p === priority && <span className="ml-auto text-primary">•</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Create Branch Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={creatingBranch}
          onClick={onCreateBranch}
          className="h-7 gap-1.5 text-xs ml-auto"
          title="Tạo nhánh Bitbucket theo định dạng chuẩn"
        >
          {creatingBranch ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <GitBranch className="h-3.5 w-3.5 text-primary" />
          )}
          {creatingBranch ? "Đang tạo…" : "Tạo nhánh Git"}
        </Button>
      </div>

      {branchMsg && (
        <div
          className={cn(
            "px-4 py-1.5 text-xs font-medium",
            branchMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {branchMsg.text}
        </div>
      )}
    </>
  );
}
