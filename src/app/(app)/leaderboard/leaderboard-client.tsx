"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Sparkles, RotateCw } from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/async-state";
import { LeaderboardSummaryCards } from "./leaderboard-summary-cards";
import { LeaderboardFilterBar } from "./leaderboard-filter-bar";
import { LeaderboardPersonalBanner } from "./leaderboard-personal-banner";
import { LeaderboardPodium } from "./leaderboard-podium";
import { LeaderboardTable } from "./leaderboard-table";
import { LeaderboardMemberModal } from "./leaderboard-member-modal";
import { LeaderboardRealmsModal } from "./leaderboard-realms-modal";
import {
  ALL_PROJECTS,
  groupTiersByRealm,
  buildLeaderboardQueryUrl,
  filterAndSortMembers,
} from "./lib/leaderboard-utils";
import type {
  LeaderboardResponse,
  LeaderboardMember,
  LeaderboardTimeframe,
} from "@/lib/leaderboard/types";

export function LeaderboardClient() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  // Filter states
  const [timeframe, setTimeframe] = useState<LeaderboardTimeframe>("month");
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState<number>(currentQuarter);
  const [selectedProject, setSelectedProject] = useState<string>(ALL_PROJECTS);
  const [searchMember, setSearchMember] = useState("");
  const [sortBy, setSortBy] = useState<"completed" | "total" | "tasks">("completed");

  // Selected member for detail modal
  const [activeMemberModal, setActiveMemberModal] = useState<LeaderboardMember | null>(null);
  const [showRealmsModal, setShowRealmsModal] = useState(false);

  // Group tiers by realm for cultivation guide modal
  const realmGroups = useMemo(() => groupTiersByRealm(), []);

  // Query URL builder
  const queryUrl = useMemo(
    () => buildLeaderboardQueryUrl(timeframe, selectedYear, selectedMonth, selectedQuarter, selectedProject),
    [timeframe, selectedYear, selectedMonth, selectedQuarter, selectedProject]
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", timeframe, selectedYear, selectedMonth, selectedQuarter, selectedProject],
    queryFn: () => api<LeaderboardResponse>(queryUrl),
    staleTime: 60_000,
  });

  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const summary = data?.summary;
  const myPerformance = data?.myPerformance;
  const projects = useMemo(() => data?.projects ?? [], [data?.projects]);

  // Filter & sort members in table
  const filteredMembers = useMemo(
    () => filterAndSortMembers(members, searchMember, sortBy),
    [members, searchMember, sortBy]
  );

  // Podium top 3
  const top1 = members.length > 0 && members[0].completedPoints > 0 ? members[0] : null;
  const top2 = members.length > 1 && members[1].completedPoints > 0 ? members[1] : null;
  const top3 = members.length > 2 && members[2].completedPoints > 0 ? members[2] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* ── Page Header ────────────────────────────────────────── */}
      <PageHeader
        icon={Trophy}
        title="Bảng Phong Thần - Xếp Hạng Tu Tiên"
        description="Tích lũy Story Point tu vi, đột phá cảnh giới và lưu danh vạn cổ trên bảng vàng tông môn."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRealmsModal(true)}
              className="cursor-pointer gap-1.5 text-xs border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sổ Cảnh Giới Tu Tiên</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="cursor-pointer gap-2 text-xs"
            >
              <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
              <span>Làm mới</span>
            </Button>
          </div>
        }
      />

      {/* ── Filter Bar: Timeframe & Scope ──────────────────────── */}
      <LeaderboardFilterBar
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedQuarter={selectedQuarter}
        setSelectedQuarter={setSelectedQuarter}
        selectedProject={selectedProject}
        setSelectedProject={setSelectedProject}
        projects={projects}
        periodLabel={data?.periodLabel}
        currentYear={currentYear}
        currentMonth={currentMonth}
        currentQuarter={currentQuarter}
      />

      {/* ── KPI Summary Cards ──────────────────────────────────── */}
      {error && !data ? (
        <ErrorState
          message={getErrorMessage(error)}
          onRetry={() => void refetch()}
          retryDisabled={isFetching}
        />
      ) : (
        <>
          <LeaderboardSummaryCards summary={summary} loading={isLoading} />

          {/* ── Personal Performance Banner ("Thành tích của bạn") ──── */}
          {myPerformance && (
            <LeaderboardPersonalBanner
              myPerformance={myPerformance}
              onViewMyTasks={() => {
                const me = members.find((m) => m.isCurrentUser);
                if (me) setActiveMemberModal(me);
              }}
            />
          )}

          {/* ── Top 3 Podium (Bục Vinh Quang) ──────────────────────── */}
          <LeaderboardPodium
            top1={top1}
            top2={top2}
            top3={top3}
            periodLabel={data?.periodLabel}
            isLoading={isLoading}
            onSelectMember={setActiveMemberModal}
          />

          {/* ── Ranking Table & Search Controls ─────────────────────── */}
          <LeaderboardTable
            filteredMembers={filteredMembers}
            searchMember={searchMember}
            onSearchMemberChange={setSearchMember}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            isLoading={isLoading}
            onSelectMember={setActiveMemberModal}
          />
        </>
      )}

      {/* ── Task Contribution Breakdown Modal (Radix Dialog) ───── */}
      <LeaderboardMemberModal
        member={activeMemberModal}
        onClose={() => setActiveMemberModal(null)}
        periodLabel={data?.periodLabel}
      />

      {/* ── Cultivation Realms Guide Modal ("Sổ Cảnh Giới Tu Tiên") ──── */}
      <LeaderboardRealmsModal
        open={showRealmsModal}
        onOpenChange={setShowRealmsModal}
        realmGroups={realmGroups}
      />
    </div>
  );
}
