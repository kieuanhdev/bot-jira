"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Sparkles,
  Zap,
  Flame,
  CheckCircle2,
  TrendingUp,
  Target,
  Star,
  User as UserIcon,
  ExternalLink,
  Search,
  Calendar,
  RotateCw,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Inbox,
} from "lucide-react";
import type {
  LeaderboardResponse,
  LeaderboardMember,
  LeaderboardTimeframe,
  LeaderboardTier,
  LeaderboardTaskItem,
} from "@/lib/leaderboard/types";

const ALL_PROJECTS = "ALL";

// Helper for initials
function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tier icon resolver
function TierIcon({ iconName, className }: { iconName: LeaderboardTier["iconName"]; className?: string }) {
  switch (iconName) {
    case "Sparkles":
      return <Sparkles className={className} aria-hidden="true" />;
    case "Zap":
      return <Zap className={className} aria-hidden="true" />;
    case "Trophy":
      return <Trophy className={className} aria-hidden="true" />;
    case "Medal":
      return <Medal className={className} aria-hidden="true" />;
    case "Award":
      return <Award className={className} aria-hidden="true" />;
    case "Star":
    default:
      return <Star className={className} aria-hidden="true" />;
  }
}

// Rank Medal Component
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 ring-2 ring-amber-500/40 font-bold text-sm shadow-sm shadow-amber-500/20">
        <Crown className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-400/20 text-slate-300 ring-2 ring-slate-400/40 font-bold text-sm">
        <Medal className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-700/20 text-amber-600 ring-2 ring-amber-700/40 font-bold text-sm">
        <Award className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
      {rank}
    </div>
  );
}

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
  const [taskSearch, setTaskSearch] = useState("");

  // Query URL builder
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("timeframe", timeframe);
    params.set("year", selectedYear.toString());
    if (timeframe === "month") params.set("month", selectedMonth.toString());
    if (timeframe === "quarter") params.set("quarter", selectedQuarter.toString());
    if (selectedProject !== ALL_PROJECTS) params.set("project", selectedProject);
    return `/api/leaderboard?${params.toString()}`;
  }, [timeframe, selectedYear, selectedMonth, selectedQuarter, selectedProject]);

  const { data, isLoading, isFetching, refetch } = useQuery<LeaderboardResponse>({
    queryKey: ["leaderboard", timeframe, selectedYear, selectedMonth, selectedQuarter, selectedProject],
    queryFn: () => api<LeaderboardResponse>(queryUrl),
    staleTime: 60_000,
  });

  const members = data?.members ?? [];
  const summary = data?.summary;
  const myPerformance = data?.myPerformance;
  const projects = data?.projects ?? [];

  // Filter & sort members in table
  const filteredMembers = useMemo(() => {
    let list = [...members];
    if (searchMember.trim()) {
      const q = searchMember.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) ||
          m.jiraUsername.toLowerCase().includes(q)
      );
    }
    if (sortBy === "total") {
      list.sort((a, b) => b.totalPoints - a.totalPoints || b.completedPoints - a.completedPoints);
    } else if (sortBy === "tasks") {
      list.sort((a, b) => b.completedTasks - a.completedTasks || b.completedPoints - a.completedPoints);
    } else {
      list.sort((a, b) => b.completedPoints - a.completedPoints || b.completedTasks - a.completedTasks);
    }
    return list;
  }, [members, searchMember, sortBy]);

  // Podium top 3
  const top1 = members.length > 0 && members[0].completedPoints > 0 ? members[0] : null;
  const top2 = members.length > 1 && members[1].completedPoints > 0 ? members[1] : null;
  const top3 = members.length > 2 && members[2].completedPoints > 0 ? members[2] : null;

  // Filter tasks in detail modal
  const modalTasks = useMemo(() => {
    if (!activeMemberModal) return [];
    if (!taskSearch.trim()) return activeMemberModal.tasks;
    const q = taskSearch.trim().toLowerCase();
    return activeMemberModal.tasks.filter(
      (t) =>
        t.jiraKey.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.status.toLowerCase().includes(q)
    );
  }, [activeMemberModal, taskSearch]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* ── Page Header & Motivational Hero ────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-teal-700 text-white shadow-md shadow-primary/25">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Bảng Xếp Hạng Năng Suất</h1>
              <p className="text-sm text-muted-foreground">
                Tích lũy Story Point, vinh danh cá nhân và tiếp thêm động lực cho toàn đội ngũ.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="cursor-pointer gap-2 text-xs"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} aria-hidden="true" />
            <span>Làm mới</span>
          </Button>
        </div>
      </div>

      {/* ── Filter Bar: Timeframe & Scope ──────────────────────── */}
      <Card className="border bg-card shadow-xs">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Timeframe primary tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted p-1 border border-border">
              <button
                type="button"
                onClick={() => setTimeframe("month")}
                className={cn(
                  "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                  timeframe === "month"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Theo Tháng
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("quarter")}
                className={cn(
                  "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                  timeframe === "quarter"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Theo Quý
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("year")}
                className={cn(
                  "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                  timeframe === "year"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Theo Năm
              </button>
              <button
                type="button"
                onClick={() => setTimeframe("all")}
                className={cn(
                  "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                  timeframe === "all"
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Tất Cả
              </button>
            </div>

            {/* Granular Period Selectors & Project Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Specific Month selector */}
              {timeframe === "month" && (
                <div className="w-36">
                  <Select
                    value={selectedMonth.toString()}
                    onValueChange={(val) => setSelectedMonth(parseInt(val, 10))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Chọn tháng" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <SelectItem key={m} value={m.toString()} className="text-xs">
                          Tháng {m} {m === currentMonth && selectedYear === currentYear ? "(Hiện tại)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Specific Quarter selector */}
              {timeframe === "quarter" && (
                <div className="w-36">
                  <Select
                    value={selectedQuarter.toString()}
                    onValueChange={(val) => setSelectedQuarter(parseInt(val, 10))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Chọn quý" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((q) => (
                        <SelectItem key={q} value={q.toString()} className="text-xs">
                          Quý {q} {q === currentQuarter && selectedYear === currentYear ? "(Hiện tại)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Year selector (for month, quarter, and year modes) */}
              {timeframe !== "all" && (
                <div className="w-28">
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(val) => setSelectedYear(parseInt(val, 10))}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Năm" />
                    </SelectTrigger>
                    <SelectContent>
                      {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                        <SelectItem key={y} value={y.toString()} className="text-xs">
                          Năm {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Project filter */}
              <div className="w-40">
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Dự án mobile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_PROJECTS} className="text-xs">
                      Tất cả dự án mobile ({projects.length})
                    </SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        Dự án {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active period label pill */}
              {data?.periodLabel && (
                <Badge variant="outline" className="hidden xl:inline-flex gap-1.5 py-1.5 px-3 bg-muted/60 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>{data.periodLabel}</span>
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Summary Cards ──────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {/* Card 1: Total Points */}
          <Card className="border bg-card">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Tổng điểm hoàn thành</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Trophy className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {summary?.totalTeamPoints ?? 0}
                </span>
                <span className="text-xs font-semibold text-primary">Story Points</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Total Tasks */}
          <Card className="border bg-card">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Task đã chốt</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {summary?.totalTeamTasks ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">tasks hoàn thành</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Average Points */}
          <Card className="border bg-card">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Điểm TB / Thành viên</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <TrendingUp className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {summary?.averagePointsPerMember ?? 0}
                </span>
                <span className="text-xs text-muted-foreground">pts / người</span>
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Current MVP */}
          <Card className="border bg-card">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Quán Quân (MVP)</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                  <Crown className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <div className="mt-2">
                {summary?.topPerformer ? (
                  <div>
                    <div className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate">
                      {summary.topPerformer.displayName}
                    </div>
                    <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      {summary.topPerformer.points} points hoàn thành
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">Chưa xác định</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Personal Performance Banner ("Thành tích của bạn") ──── */}
      {myPerformance && (
        <Card className="relative overflow-hidden border-2 border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Left: User status & rank */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="flex h-13 w-13 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-lg ring-2 ring-primary">
                  {myPerformance.rank <= 3 ? (
                    <Crown className="h-6 w-6 text-amber-500" aria-hidden="true" />
                  ) : (
                    `#${myPerformance.rank}`
                  )}
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card ring-1 ring-border">
                  <TierIcon iconName={myPerformance.tier.iconName} className="h-3.5 w-3.5 text-primary" />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-foreground">Thành tích của bạn</span>
                  <Badge variant="outline" className={cn("text-xs font-semibold gap-1", myPerformance.tier.badgeClass)}>
                    <TierIcon iconName={myPerformance.tier.iconName} className="h-3 w-3" />
                    <span>Cấp bậc: {myPerformance.tier.name}</span>
                  </Badge>
                  <Badge variant="secondary" className="text-xs font-medium">
                    Hạng #{myPerformance.rank} toàn đội
                  </Badge>
                </div>

                <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Đã tích lũy:{" "}
                    <strong className="text-foreground text-sm font-bold text-primary">
                      {myPerformance.completedPoints} pts
                    </strong>
                  </span>
                  {myPerformance.inProgressPoints > 0 && (
                    <span>
                      • Đang làm:{" "}
                      <strong className="text-foreground font-semibold">{myPerformance.inProgressPoints} pts</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Center / Right: Progress to next rank & Tier */}
            <div className="flex flex-1 flex-col gap-2 max-w-md">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  <span>Tiến độ cấp {myPerformance.nextTier?.name ?? "Tối đa"}</span>
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {myPerformance.tierProgressPercent}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-gradient-to-r from-primary to-teal-400 transition-all duration-500 ease-out"
                  style={{ width: `${myPerformance.tierProgressPercent}%` }}
                />
              </div>

              {/* Motivational Cheer phrase */}
              <p className="text-xs font-medium text-muted-foreground leading-snug">
                {myPerformance.cheerMessage}
              </p>
            </div>

            {/* Right Action */}
            <div className="shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const me = members.find((m) => m.isCurrentUser);
                  if (me) setActiveMemberModal(me);
                }}
                className="cursor-pointer gap-2 border-primary/40 text-primary hover:bg-primary/10 text-xs font-semibold"
              >
                <span>Xem task của bạn</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Top 3 Podium (Bục Vinh Quang) ──────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : top1 ? (
        <Card className="border bg-gradient-to-b from-card via-card to-muted/30 shadow-xs overflow-hidden">
          <div className="p-5 border-b bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Bục Vinh Quang (Top 3)
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">{data?.periodLabel}</span>
          </div>

          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end max-w-4xl mx-auto pt-4 pb-2">
              {/* Rank 2 (Silver) - Left Column on desktop */}
              {top2 ? (
                <div className="flex flex-col items-center order-2 md:order-1">
                  <div className="relative mb-3 flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-300/20 text-slate-300 font-bold text-xl ring-4 ring-slate-400/40 shadow-md">
                      {getInitials(top2.displayName)}
                    </div>
                    <div className="absolute -bottom-2.5 flex h-7 items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2 text-[11px] font-bold text-slate-800 dark:text-slate-200 shadow-sm">
                      <Medal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" aria-hidden="true" />
                      <span>Á Quân 1</span>
                    </div>
                  </div>

                  <div className="mt-2 text-center w-full">
                    <div className="font-bold text-foreground text-sm truncate px-2">{top2.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">@{top2.jiraUsername}</div>
                    <Badge variant="outline" className={cn("mt-1.5 text-[10px]", top2.tier.badgeClass)}>
                      {top2.tier.name}
                    </Badge>
                  </div>

                  {/* Pedestal Box */}
                  <div className="mt-4 w-full rounded-t-xl border border-b-0 border-slate-400/30 bg-gradient-to-t from-slate-400/20 to-slate-400/5 p-4 text-center">
                    <div className="text-2xl font-black text-foreground tabular-nums">
                      {top2.completedPoints}
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">Story Points</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {top2.completedTasks} task hoàn thành
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveMemberModal(top2)}
                      className="mt-2 h-7 cursor-pointer text-xs text-primary hover:text-primary hover:bg-primary/10"
                    >
                      Chi tiết task
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-col items-center order-2 md:order-1 text-muted-foreground text-xs italic">
                  Chưa có Á Quân 1
                </div>
              )}

              {/* Rank 1 (Gold / MVP) - Elevated Center Column */}
              <div className="flex flex-col items-center order-1 md:order-2">
                <div className="relative mb-3 flex flex-col items-center">
                  <Crown className="h-7 w-7 text-amber-500 animate-bounce mb-1" aria-hidden="true" />
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black text-2xl ring-4 ring-amber-400/50 shadow-xl shadow-amber-500/30">
                    {getInitials(top1.displayName)}
                  </div>
                  <div className="absolute -bottom-2.5 flex h-7 items-center gap-1 rounded-full bg-amber-500 px-3 text-[11px] font-black text-slate-950 shadow-md">
                    <Crown className="h-3.5 w-3.5 text-slate-950" aria-hidden="true" />
                    <span>QUÁN QUÂN #1</span>
                  </div>
                </div>

                <div className="mt-2 text-center w-full">
                  <div className="font-extrabold text-foreground text-base truncate px-2">{top1.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">@{top1.jiraUsername}</div>
                  <Badge variant="outline" className={cn("mt-1.5 text-xs font-bold", top1.tier.badgeClass)}>
                    <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                    {top1.tier.name}
                  </Badge>
                </div>

                {/* Pedestal Box (Tallest) */}
                <div className="mt-4 w-full rounded-t-xl border border-b-0 border-amber-500/40 bg-gradient-to-t from-amber-500/25 via-amber-500/10 to-amber-500/5 p-5 text-center shadow-lg shadow-amber-500/10">
                  <div className="text-3xl font-black text-amber-500 tabular-nums">
                    {top1.completedPoints}
                  </div>
                  <div className="text-xs font-semibold text-foreground">Story Points</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {top1.completedTasks} task hoàn thành • {top1.sharePercentage}% tổng điểm
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveMemberModal(top1)}
                    className="mt-3 h-8 cursor-pointer border-amber-500/50 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                  >
                    Xem task đóng góp
                  </Button>
                </div>
              </div>

              {/* Rank 3 (Bronze) - Right Column */}
              {top3 ? (
                <div className="flex flex-col items-center order-3 md:order-3">
                  <div className="relative mb-3 flex flex-col items-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-800/20 text-amber-600 font-bold text-xl ring-4 ring-amber-700/40 shadow-md">
                      {getInitials(top3.displayName)}
                    </div>
                    <div className="absolute -bottom-2.5 flex h-7 items-center gap-1 rounded-full bg-amber-700 text-white px-2 text-[11px] font-bold shadow-sm">
                      <Award className="h-3.5 w-3.5 text-white" aria-hidden="true" />
                      <span>Á Quân 2</span>
                    </div>
                  </div>

                  <div className="mt-2 text-center w-full">
                    <div className="font-bold text-foreground text-sm truncate px-2">{top3.displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">@{top3.jiraUsername}</div>
                    <Badge variant="outline" className={cn("mt-1.5 text-[10px]", top3.tier.badgeClass)}>
                      {top3.tier.name}
                    </Badge>
                  </div>

                  {/* Pedestal Box */}
                  <div className="mt-4 w-full rounded-t-xl border border-b-0 border-amber-700/30 bg-gradient-to-t from-amber-700/20 to-amber-700/5 p-4 text-center">
                    <div className="text-2xl font-black text-foreground tabular-nums">
                      {top3.completedPoints}
                    </div>
                    <div className="text-[11px] font-medium text-muted-foreground">Story Points</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {top3.completedTasks} task hoàn thành
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveMemberModal(top3)}
                      className="mt-2 h-7 cursor-pointer text-xs text-primary hover:text-primary hover:bg-primary/10"
                    >
                      Chi tiết task
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="hidden md:flex flex-col items-center order-3 md:order-3 text-muted-foreground text-xs italic">
                  Chưa có Á Quân 2
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Ranking Table & Search Controls ─────────────────────── */}
      <Card className="border bg-card shadow-xs">
        <div className="p-4 sm:p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold text-foreground">Bảng Tổng Sắp Toàn Đội</h2>
            <Badge variant="secondary" className="text-xs">
              {filteredMembers.length} thành viên
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search input */}
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="text"
                placeholder="Tìm thành viên..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                className="h-9 pl-8 text-xs"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="w-44">
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Sắp xếp theo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed" className="text-xs">
                    Điểm hoàn thành (Cao → Thấp)
                  </SelectItem>
                  <SelectItem value="total" className="text-xs">
                    Tổng điểm (Đã chốt + Đang làm)
                  </SelectItem>
                  <SelectItem value="tasks" className="text-xs">
                    Số lượng task hoàn thành
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
                <Inbox className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-foreground">Không có dữ liệu</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Không tìm thấy thành viên nào có point trong khoảng thời gian hoặc dự án đã chọn.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 w-16 text-center">Hạng</th>
                    <th className="py-3 px-4">Thành viên</th>
                    <th className="py-3 px-4">Cấp bậc</th>
                    <th className="py-3 px-4 text-right">Điểm hoàn thành</th>
                    <th className="py-3 px-4 text-right">Đang làm</th>
                    <th className="py-3 px-4 text-center">Số Task</th>
                    <th className="py-3 px-4 w-32 hidden sm:table-cell">Đóng góp</th>
                    <th className="py-3 px-4 text-right w-24">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.jiraUsername}
                      className={cn(
                        "transition-colors duration-150 hover:bg-muted/50",
                        member.isCurrentUser && "bg-primary/5 font-medium"
                      )}
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-center align-middle">
                        <div className="flex items-center justify-center">
                          <RankBadge rank={member.rank} />
                        </div>
                      </td>

                      {/* Member Info */}
                      <td className="py-3.5 px-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-xs ring-1 ring-border text-foreground">
                            {getInitials(member.displayName)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-semibold text-foreground text-sm truncate">
                                {member.displayName}
                              </span>
                              {member.isCurrentUser && (
                                <Badge variant="default" className="text-[10px] py-0 px-1.5 h-4 bg-primary text-primary-foreground font-bold">
                                  Bạn
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              @{member.jiraUsername}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Tier Badge */}
                      <td className="py-3.5 px-4 align-middle">
                        <Badge
                          variant="outline"
                          className={cn("text-xs font-semibold gap-1 py-0.5", member.tier.badgeClass)}
                        >
                          <TierIcon iconName={member.tier.iconName} className="h-3 w-3" />
                          <span>{member.tier.name}</span>
                        </Badge>
                      </td>

                      {/* Completed Points */}
                      <td className="py-3.5 px-4 text-right align-middle">
                        <span className="text-base font-bold text-primary tabular-nums">
                          {member.completedPoints}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-1">pts</span>
                      </td>

                      {/* In Progress Points */}
                      <td className="py-3.5 px-4 text-right align-middle">
                        {member.inProgressPoints > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                            <Zap className="h-3 w-3" aria-hidden="true" />
                            {member.inProgressPoints} pts
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground tabular-nums">0</span>
                        )}
                      </td>

                      {/* Completed Tasks Count */}
                      <td className="py-3.5 px-4 text-center align-middle">
                        <span className="inline-flex items-center justify-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                          {member.completedTasks}
                        </span>
                      </td>

                      {/* Share Progress Bar */}
                      <td className="py-3.5 px-4 align-middle hidden sm:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                            <span>{member.sharePercentage}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, member.sharePercentage)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* View Action */}
                      <td className="py-3.5 px-4 text-right align-middle">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setActiveMemberModal(member)}
                          className="h-8 cursor-pointer px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                          title="Xem danh sách task"
                        >
                          <span className="hidden sm:inline">Xem</span>
                          <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Task Contribution Breakdown Modal (Radix Dialog) ───── */}
      <Dialog
        open={Boolean(activeMemberModal)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveMemberModal(null);
            setTaskSearch("");
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader className="space-y-1">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
              <DialogTitle className="text-lg font-bold">
                Task đóng góp - {activeMemberModal?.displayName}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {data?.periodLabel} • Tổng {activeMemberModal?.completedPoints ?? 0} story points hoàn thành
            </DialogDescription>
          </DialogHeader>

          {/* Quick Stats Pills in Modal */}
          {activeMemberModal && (
            <div className="grid grid-cols-3 gap-2.5 my-2">
              <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
                <div className="text-lg font-bold text-primary tabular-nums">
                  {activeMemberModal.completedPoints}
                </div>
                <div className="text-[11px] text-muted-foreground">Điểm đã chốt</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
                <div className="text-lg font-bold text-foreground tabular-nums">
                  {activeMemberModal.completedTasks}
                </div>
                <div className="text-[11px] text-muted-foreground">Task hoàn thành</div>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
                <div className="text-lg font-bold text-amber-500 tabular-nums">
                  {activeMemberModal.inProgressPoints}
                </div>
                <div className="text-[11px] text-muted-foreground">Điểm đang làm</div>
              </div>
            </div>
          )}

          {/* Search inside modal */}
          <div className="relative my-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Tìm theo mã task hoặc tiêu đề..."
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Task list inside modal */}
          <div className="flex-1 overflow-y-auto min-h-48 divide-y divide-border border rounded-md">
            {modalTasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground italic">
                Không tìm thấy task nào phù hợp.
              </div>
            ) : (
              modalTasks.map((t) => {
                const isDone = t.statusCategory.toLowerCase() === "done";
                return (
                  <div
                    key={t.jiraKey}
                    className="p-3 hover:bg-muted/40 transition-colors flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/board?q=${t.jiraKey}`}
                          className="font-mono font-bold text-primary hover:underline"
                        >
                          {t.jiraKey}
                        </Link>
                        <Badge
                          variant={isDone ? "success" : "info"}
                          className="text-[10px] py-0 px-1.5 h-4.5"
                        >
                          {t.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4.5 text-muted-foreground">
                          {t.projectKey}
                        </Badge>
                      </div>
                      <p className="text-foreground font-medium line-clamp-2 leading-relaxed">
                        {t.summary}
                      </p>
                      {t.completedAt && (
                        <p className="text-[11px] text-muted-foreground">
                          Hoàn thành: {new Date(t.completedAt).toLocaleDateString("vi-VN")}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <Badge
                        variant="default"
                        className={cn(
                          "font-bold text-xs tabular-nums px-2 py-0.5",
                          isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {t.points} pts
                      </Badge>
                      <Link
                        href={`/board?q=${t.jiraKey}`}
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <span>Mở board</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
