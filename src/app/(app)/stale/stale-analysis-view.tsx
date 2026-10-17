"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { UserRoundX, X } from "lucide-react";
import type { FocusMode, SortMode, StaleResponse } from "./lib/stale-types";
import { ALL } from "./lib/stale-types";
import {
  sortTasks,
  computeFocusCounts,
  filterFocusedTasks,
} from "./lib/stale-utils";
import { ActionQueue, InsightBrief } from "./stale-team-sections";
import { StaleDeepDive, StaleDiagnosticsSection, StaleFocusSection } from "./stale-focus-sections";
import { StaleDataQualityCard, StaleWipCard } from "./stale-insight-cards";
import { StaleTaskListCard } from "./stale-task-list-card";
import { MyWorkHealthyState } from "./stale-my-work-healthy";
import { StaleEmptyState } from "./stale-empty-state";

export interface ActiveDrilldownChipsProps {
  supportAssignee: string | null;
  bottleneckStatus: string | null;
  onClearSupportAssignee: () => void;
  onClearBottleneckStatus: () => void;
}

export function ActiveDrilldownChips({
  supportAssignee,
  bottleneckStatus,
  onClearSupportAssignee,
  onClearBottleneckStatus,
}: ActiveDrilldownChipsProps) {
  if (!supportAssignee && !bottleneckStatus) return null;

  const chips = [
    supportAssignee && {
      label: `Người xử lý: ${supportAssignee}`,
      clear: onClearSupportAssignee,
    },
    bottleneckStatus && {
      label: `Trạng thái: ${bottleneckStatus}`,
      clear: onClearBottleneckStatus,
    },
  ].filter((c): c is { label: string; clear: () => void } => Boolean(c));

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Đang lọc:</span>
      {chips.map((chip) => (
        <Badge key={chip.label} variant="outline" className="gap-1 font-medium">
          {chip.label}
          <button
            type="button"
            onClick={chip.clear}
            aria-label={`Bỏ lọc ${chip.label}`}
            className="cursor-pointer rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </Badge>
      ))}
    </div>
  );
}

export interface StaleAnalysisViewProps {
  data: StaleResponse;
  viewMode: "my-work" | "team";
  status: string;
  reason: string;
  severity: string;
  hasServerFilters: boolean;
  onClearScopeFilters: () => void;
  onViewTeam?: () => void;
  onViewStandardization: () => void;
}

export function StaleAnalysisView({
  data,
  viewMode,
  status,
  reason,
  severity,
  hasServerFilters,
  onClearScopeFilters,
  onViewTeam,
  onViewStandardization,
}: StaleAnalysisViewProps) {
  const [focus, setFocus] = useState<FocusMode>("all");
  const [query, setQuery] = useState("");
  const [supportAssignee, setSupportAssignee] = useState<string | null>(null);
  const [bottleneckStatus, setBottleneckStatus] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [visibleCount, setVisibleCount] = useState(50);

  const focusedTasks = useMemo(() => {
    let tasks = filterFocusedTasks(data.tasks ?? [], focus, query);
    if (supportAssignee) tasks = tasks.filter((task) => task.assigneeJira === supportAssignee);
    if (bottleneckStatus) tasks = tasks.filter((task) => task.status === bottleneckStatus);
    return tasks;
  }, [data.tasks, focus, query, supportAssignee, bottleneckStatus]);

  const sortedTasks = useMemo(() => sortTasks(focusedTasks, sortMode), [focusedTasks, sortMode]);
  const visibleTasks = sortedTasks.slice(0, visibleCount);
  const priorityTasks = useMemo(() => sortTasks(focusedTasks, "priority"), [focusedTasks]);

  const summary = data.summary;
  const staleRate =
    summary && summary.totalActive > 0 ? Math.round((summary.totalStale / summary.totalActive) * 100) : 0;
  const focusCounts = computeFocusCounts(data.tasks);

  const hasAnyFilter =
    hasServerFilters ||
    focus !== "all" ||
    query.trim().length > 0 ||
    supportAssignee !== null ||
    bottleneckStatus !== null;

  const clearAllFilters = () => {
    onClearScopeFilters();
    setFocus("all");
    setQuery("");
    setSupportAssignee(null);
    setBottleneckStatus(null);
    setVisibleCount(50);
  };

  const scrollToDetailList = () =>
    requestAnimationFrame(() =>
      document.getElementById("stale-detail-list")?.scrollIntoView({ behavior: "smooth", block: "start" })
    );

  return (
    <>
      <InsightBrief data={data} staleRate={staleRate} />

      {data.tasks.length > 0 && (
        <>
          <StaleFocusSection
            focus={focus}
            focusCounts={focusCounts}
            onClearFocus={() => setFocus("all")}
            onSelectFocus={(next) => {
              if (next === "unassigned") setSupportAssignee(null);
              setFocus((curr) => (curr === next ? "all" : next));
              setVisibleCount(50);
            }}
          />

          <ActionQueue tasks={priorityTasks} focus={focus} />

          <StaleDeepDive>
            <StaleDiagnosticsSection
              data={data}
              focus={focus}
              bottleneckStatus={bottleneckStatus}
              onSelectStatus={(name) => {
                setBottleneckStatus((curr) => (curr === name ? null : name));
                setVisibleCount(50);
                scrollToDetailList();
              }}
              supportAssignee={supportAssignee}
              onSelectAssignee={(name) => {
                if (focus === "unassigned") setFocus("all");
                setSupportAssignee((curr) => (curr === name ? null : name));
                setVisibleCount(50);
                scrollToDetailList();
              }}
              onSelectFocus={(mode) => {
                if (mode === "unassigned") setSupportAssignee(null);
                setFocus((curr) => (curr === mode ? "all" : mode));
                setVisibleCount(50);
                scrollToDetailList();
              }}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <StaleWipCard wip={data.wip} />
              <StaleDataQualityCard summary={summary} tasks={data.tasks} />
            </div>
          </StaleDeepDive>

          {/* Detailed Stale Task List */}
          <div id="stale-detail-list" className="scroll-mt-4 space-y-3">
            <ActiveDrilldownChips
              supportAssignee={supportAssignee}
              bottleneckStatus={bottleneckStatus}
              onClearSupportAssignee={() => setSupportAssignee(null)}
              onClearBottleneckStatus={() => setBottleneckStatus(null)}
            />

            <StaleTaskListCard
              visibleTasks={visibleTasks}
              focusedCount={focusedTasks.length}
              totalCount={data.tasks.length}
              sortedCount={sortedTasks.length}
              visibleCount={visibleCount}
              query={query}
              sortMode={sortMode}
              onQueryChange={(val) => {
                setQuery(val);
                setVisibleCount(50);
              }}
              onSortModeChange={setSortMode}
              onShowMore={() => setVisibleCount((c) => c + 50)}
              onClearFilters={clearAllFilters}
            />
          </div>

          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
            <UserRoundX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Các góc nhìn theo người xử lý chỉ phục vụ điều phối hỗ trợ và tháo gỡ điểm nghẽn. Không sử dụng chúng như bảng xếp hạng hiệu suất cá nhân.
          </p>
        </>
      )}

      {data.tasks.length === 0 && (
        viewMode === "my-work" &&
        [status, reason, severity].every((v) => v === ALL) &&
        !query.trim() &&
        focus === "all" ? (
          <MyWorkHealthyState
            myWork={data.myWork}
            onViewTeam={onViewTeam}
            onViewStandardization={onViewStandardization}
          />
        ) : (
          <StaleEmptyState filtered={hasAnyFilter} onClear={clearAllFilters} />
        )
      )}
    </>
  );
}
