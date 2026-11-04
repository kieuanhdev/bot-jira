import { useState } from "react";
import {
  ChevronDown,
  Clock,
  Flag,
  GitBranch,
  Hash,
  RefreshCw,
  User,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DropdownSearchInput } from "@/components/shared/dropdown-search-input";
import { JiraAvatar } from "@/components/jira-avatar";
import { formatJiraDuration } from "@/lib/worklogs/schema";
import { PointStepGrid } from "@/components/point-step-grid";
import { PRIORITIES } from "./lib/issue-detail-utils";

interface IssueDetailActionsProps {
  assigneeJira?: string | null;
  assignees: string[];
  meName?: string | null;
  onAssign: (assignee: string | null) => void;
  priority?: string | null;
  onSetPriority: (priority: string) => void;
  points?: number | null;
  aiPoints?: number | null;
  onSetPoints: (points: number | null) => void;
  timeSpentSeconds?: number | null;
  onOpenLogWork: () => void;
  creatingBranch: boolean;
  onCreateBranch: () => void;
}

export function IssueDetailActions({
  assigneeJira,
  assignees,
  meName,
  onAssign,
  priority,
  onSetPriority,
  points,
  aiPoints,
  onSetPoints,
  timeSpentSeconds,
  onOpenLogWork,
  creatingBranch,
  onCreateBranch,
}: IssueDetailActionsProps) {
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const isAssigneeSearchable = assignees.length > 5;
  const assigneeQuery = assigneeSearch.trim().toLowerCase();
  const filteredAssignees = assigneeQuery
    ? assignees.filter((a) => a.toLowerCase().includes(assigneeQuery))
    : assignees;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2.5 shadow-sm">
      {/* Assignee Dropdown */}
      <DropdownMenu
        open={assigneeOpen}
        onOpenChange={(o) => {
          setAssigneeOpen(o);
          if (!o) setAssigneeSearch("");
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs cursor-pointer">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{assigneeJira ? `Gán: ${assigneeJira}` : "Chưa gán ai"}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-72 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">Gán người thực hiện</DropdownMenuLabel>
          {isAssigneeSearchable && (
            <DropdownSearchInput
              value={assigneeSearch}
              onChange={setAssigneeSearch}
              placeholder="Tìm người thực hiện…"
            />
          )}
          {!assigneeQuery && (
            <>
              {meName && (
                <DropdownMenuItem
                  onClick={() => {
                    onAssign(meName);
                    setAssigneeOpen(false);
                  }}
                  className="gap-2 text-xs font-medium text-primary cursor-pointer"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Gán cho tôi ({meName})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => {
                  onAssign(null);
                  setAssigneeOpen(false);
                }}
                className="gap-2 text-xs text-muted-foreground cursor-pointer"
              >
                <User className="h-3.5 w-3.5" /> Hủy gán (Unassigned)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {filteredAssignees.length === 0 ? (
            <div className="px-2 py-2 text-center text-xs text-muted-foreground">
              Không tìm thấy &ldquo;{assigneeSearch}&rdquo;
            </div>
          ) : (
            filteredAssignees.map((a) => (
              <DropdownMenuItem
                key={a}
                onClick={() => {
                  onAssign(a);
                  setAssigneeOpen(false);
                }}
                className="gap-2 text-xs cursor-pointer"
              >
                <JiraAvatar username={a} size="xs" />
                <span className="truncate">{a}</span>
                {a === assigneeJira && <span className="ml-auto text-primary font-bold">•</span>}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick Assign to me button */}
      {meName && assigneeJira !== meName && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onAssign(meName)}
          className="gap-1.5 text-xs text-primary hover:bg-primary-soft"
          title={`Gán nhanh cho tôi (${meName})`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Gán cho tôi
        </Button>
      )}

      {/* Priority Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Flag className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{priority || "Độ ưu tiên"}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuLabel className="text-xs">Độ ưu tiên</DropdownMenuLabel>
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onSetPriority(p)} className="gap-2 text-xs">
              <Flag className="h-3.5 w-3.5" /> {p}
              {p === priority && <span className="ml-auto text-primary font-bold">•</span>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Story Points Picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{points != null ? `${points} pt` : "Đặt điểm"}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuLabel className="text-xs">Story Points</DropdownMenuLabel>
          <PointStepGrid value={points} aiPoints={aiPoints} onChange={onSetPoints} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onSetPoints(null)} className="text-xs text-destructive">
            Xóa điểm (None)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Log Work Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onOpenLogWork}
        className="gap-1.5 text-xs cursor-pointer border-primary/30 text-primary hover:bg-primary-soft"
        title="Ghi thời gian làm việc (Worklog) lên Jira"
      >
        <Clock className="h-3.5 w-3.5 text-primary" />
        <span>Ghi thời gian</span>
        {timeSpentSeconds != null && timeSpentSeconds > 0 && (
          <Badge variant="secondary" className="px-1.5 py-0.5 text-2xs ml-0.5 font-mono">
            {formatJiraDuration(timeSpentSeconds)}
          </Badge>
        )}
      </Button>

      {/* Create Bitbucket Branch */}
      <Button
        variant="outline"
        size="sm"
        disabled={creatingBranch}
        onClick={onCreateBranch}
        className="gap-1.5 text-xs ml-auto"
        title="Tạo nhánh Bitbucket theo chuẩn quy ước của team"
      >
        {creatingBranch ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <GitBranch className="h-3.5 w-3.5 text-primary" />
        )}
        {creatingBranch ? "Đang tạo nhánh…" : "Tạo nhánh Git"}
      </Button>
    </div>
  );
}
