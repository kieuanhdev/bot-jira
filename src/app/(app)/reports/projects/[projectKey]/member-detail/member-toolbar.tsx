"use client";

import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SignalStyle } from "./signal-config";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface MemberToolbarProps {
  member: MemberReportItem;
  periodLabel: string;
  analysis: IndividualMemberAnalysis;
  signal: SignalStyle;
  allMembers?: MemberReportItem[];
  onBack: () => void;
  onSelectMember?: (assignee: string) => void;
  onDrillDown?: () => void;
}

export function MemberToolbar({
  member,
  periodLabel,
  analysis,
  signal,
  allMembers,
  onBack,
  onSelectMember,
  onDrillDown,
}: MemberToolbarProps) {
  const SignalIcon = signal.icon;
  const memberIndex = allMembers
    ? allMembers.findIndex((m) => m.assignee === member.assignee)
    : -1;
  const prevMember =
    allMembers && memberIndex > 0 ? allMembers[memberIndex - 1] : null;
  const nextMember =
    allMembers && memberIndex >= 0 && memberIndex < allMembers.length - 1
      ? allMembers[memberIndex + 1]
      : null;

  return (
  <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:scale-100"
        aria-label="Quay lại danh sách thành viên (Esc)"
        title="Quay lại danh sách thành viên (Esc)"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {/* Member avatar initials badge */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold uppercase ring-1 ring-primary/20"
            aria-hidden="true"
          >
            {member.displayName.trim().slice(0, 2)}
          </div>

          <h2
            id="member-report-title"
            className="truncate text-base font-bold text-foreground sm:text-lg"
          >
            {member.displayName}
          </h2>

          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${signal.className}`}
          >
            <SignalIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {signal.label}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {member.assignee !== "unassigned" && (
            <span className="font-mono text-[11px] text-muted-foreground/80">
              @{member.assignee}
            </span>
          )}
          <span>·</span>
          <span>{periodLabel}</span>
          <span>·</span>
          <span>
            {analysis.totalTasks} task tổng cộng (Tỷ lệ hoàn thành:{" "}
            <strong className="text-foreground">{analysis.completionRate}%</strong>)
          </span>
        </div>
      </div>
    </div>

    {/* Member Quick Switcher & Task Drilldown button */}
    <div className="flex flex-wrap items-center gap-2">
      {allMembers && onSelectMember && allMembers.length > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!prevMember}
            onClick={() => prevMember && onSelectMember(prevMember.assignee)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={prevMember ? `Xem ${prevMember.displayName}` : "Đầu danh sách"}
            aria-label="Thành viên trước"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="w-[170px]">
            <Select
              value={member.assignee}
              onValueChange={(val) => onSelectMember(val)}
            >
              <SelectTrigger className="h-8 text-xs cursor-pointer">
                <SelectValue placeholder="Đổi thành viên" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {allMembers.map((m) => (
                  <SelectItem key={m.assignee} value={m.assignee} className="text-xs">
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            disabled={!nextMember}
            onClick={() => nextMember && onSelectMember(nextMember.assignee)}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={nextMember ? `Xem ${nextMember.displayName}` : "Cuối danh sách"}
            aria-label="Thành viên tiếp theo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {onDrillDown && (
        <Button
          type="button"
          onClick={onDrillDown}
          className="h-8 gap-1 text-xs cursor-pointer transition-transform duration-150 active:scale-95"
        >
          <span>Xem toàn bộ task</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      )}
    </div>
  </div>
  );
}
