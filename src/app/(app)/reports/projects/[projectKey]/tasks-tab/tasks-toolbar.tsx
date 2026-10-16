"use client";

import { Search, Filter, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MemberReportItem } from "@/lib/reports/types";

export interface TasksToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  statusGroup: string;
  onStatusGroupChange: (group: string) => void;
  assignee: string;
  onAssigneeChange: (assignee: string) => void;
  members: MemberReportItem[];
  total: number;
}

export function TasksToolbar({
  search,
  onSearchChange,
  statusGroup,
  onStatusGroupChange,
  assignee,
  onAssigneeChange,
  members,
  total,
}: TasksToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="Tìm theo mã hoặc tiêu đề task..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 h-9 text-xs"
          aria-label="Tìm kiếm task"
        />
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
        {/* Status Group Dropdown */}
        <div className="w-[140px]">
          <Select value={statusGroup || "all"} onValueChange={onStatusGroupChange}>
            <SelectTrigger className="h-9 text-xs cursor-pointer">
              <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              <SelectItem value="Backlog">Backlog</SelectItem>
              <SelectItem value="To Do">To Do</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="In Review">In Review</SelectItem>
              <SelectItem value="QA/Test">QA/Test</SelectItem>
              <SelectItem value="Blocked">Blocked</SelectItem>
              <SelectItem value="Done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Assignee Dropdown */}
        <div className="w-[160px]">
          <Select value={assignee || "all"} onValueChange={onAssigneeChange}>
            <SelectTrigger className="h-9 text-xs cursor-pointer">
              <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="Người làm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả người làm</SelectItem>
              <SelectItem value="unassigned">Chưa phân công</SelectItem>
              {members
                .filter((m) => m.assignee !== "unassigned")
                .map((m) => (
                  <SelectItem key={m.assignee} value={m.assignee}>
                    {m.displayName}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground whitespace-nowrap ml-auto">
          Tổng số: <strong className="text-foreground">{total}</strong> task
        </div>
      </div>
    </div>
  );
}
